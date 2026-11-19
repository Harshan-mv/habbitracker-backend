const User = require('../models/User');
const LoginAttempt = require('../models/LoginAttempt');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const googleAuthClient = new OAuth2Client();
const networkErrorCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);

const createAuthError = (statusCode, code, message) => Object.assign(
  new Error(message),
  { statusCode, code },
);

const normalizeEmail = (email) => email.trim().toLowerCase();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const findEmailMatches = (email) => User.find({
  email: new RegExp(`^\\s*${escapeRegExp(email.trim())}\\s*$`, 'i'),
}).limit(2);

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  googleLinked: Boolean(user.googleId),
});
const createSession = (user) => ({
  token: jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' }),
  user: publicUser(user),
});

const verifyGoogleCredential = async (credential) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw createAuthError(503, 'GOOGLE_SIGN_IN_UNAVAILABLE', 'Google sign-in is not configured.');
  }

  let ticket;
  try {
    ticket = await googleAuthClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (error) {
    const responseStatus = Number(error.response?.status);
    const unavailable = responseStatus === 429
      || responseStatus >= 500
      || networkErrorCodes.has(error.code);
    throw createAuthError(
      unavailable ? 503 : 401,
      unavailable ? 'GOOGLE_VERIFICATION_UNAVAILABLE' : 'INVALID_GOOGLE_CREDENTIAL',
      unavailable ? 'Google sign-in could not be verified. Please try again.' : 'Invalid Google credential.',
    );
  }

  const payload = ticket.getPayload();
  if (
    !payload
    || typeof payload.sub !== 'string'
    || typeof payload.email !== 'string'
    || payload.email_verified !== true
    || !Number.isFinite(payload.exp)
    || payload.exp * 1000 <= Date.now()
  ) {
    throw createAuthError(401, 'INVALID_GOOGLE_CREDENTIAL', 'Google must provide a verified, current email address.');
  }

  return {
    googleId: payload.sub,
    email: normalizeEmail(payload.email),
    name: typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : payload.email.split('@')[0],
  };
};

const sendExistingAccountConflict = (res, matches) => {
  if (matches.length > 1) {
    return res.status(409).json({
      code: 'AMBIGUOUS_ACCOUNT_EMAIL',
      message: 'More than one account matches this email. Please contact support before linking Google.',
    });
  }
  const hasPassword = Boolean(matches[0].passwordHash);
  return res.status(409).json({
    code: hasPassword ? 'PASSWORD_SIGN_IN_REQUIRED' : 'ACCOUNT_SIGN_IN_REQUIRED',
    message: hasPassword
      ? 'An account with this email already exists. Sign in with your password first, then link Google from your account menu.'
      : 'An account with this email already exists. Sign in with its current method first, then link Google from your account menu.',
  });
};

const sendControllerError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ code: error.code, message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: 'Server error' });
};

const positiveNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const lockDurationMs = () => positiveNumber('LOGIN_LOCK_MINUTES', 15) * 60 * 1000;
const attemptTtlMs = () => positiveNumber('LOGIN_ATTEMPT_TTL_HOURS', 24) * 60 * 60 * 1000;
const failureLimit = (scope) => Math.max(1, Math.floor(positiveNumber(
  scope === 'ip' ? 'LOGIN_IP_MAX_FAILED_ATTEMPTS' : 'LOGIN_MAX_FAILED_ATTEMPTS',
  scope === 'ip' ? 20 : 5,
)));

const hashAttemptSubject = (value) => crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(value)
  .digest('hex');

const attemptSubjects = (email, ip) => [
  { scope: 'account', subjectHash: hashAttemptSubject(`account:${email.trim().toLowerCase()}:ip:${ip || 'unknown'}`) },
  { scope: 'ip', subjectHash: hashAttemptSubject(`ip:${ip || 'unknown'}`) },
];

const isLoginLocked = async (subjects) => Boolean(await LoginAttempt.exists({
  $or: subjects,
  lockedUntil: { $gt: new Date() },
}));

const recordFailedLogin = async (subjects) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + attemptTtlMs());
  const records = await Promise.all(subjects.map(async ({ scope, subjectHash }) => {
    const filter = { scope, subjectHash };
    const update = {
      $inc: { failures: 1 },
      $set: { expiresAt },
      $setOnInsert: { lockedUntil: null },
    };
    try {
      return await LoginAttempt.findOneAndUpdate(filter, update, {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return LoginAttempt.findOneAndUpdate(filter, {
        $inc: { failures: 1 },
        $set: { expiresAt },
      }, { returnDocument: 'after' });
    }
  }));
  await Promise.all(records.map((record, index) => {
    if (record.failures < failureLimit(subjects[index].scope)) return null;
    return LoginAttempt.updateOne(
      { scope: subjects[index].scope, subjectHash: subjects[index].subjectHash },
      { $set: { lockedUntil: new Date(now.getTime() + lockDurationMs()) } },
    );
  }));
};

const clearFailedLogin = (subjects) => LoginAttempt.deleteMany({ $or: subjects });

const resetExpiredLoginLock = (subjects) => LoginAttempt.updateMany(
  { $or: subjects, lockedUntil: { $ne: null, $lte: new Date() } },
  { $set: { failures: 0, lockedUntil: null } },
);

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    user = new User({ name, email, passwordHash });
    await user.save();

    return res.status(201).json(createSession(user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const subjects = attemptSubjects(email, req.ip);
    await resetExpiredLoginLock(subjects);
    if (await isLoginLocked(subjects)) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = await User.findOne({ email: email.trim() });
    if (!user) {
      await recordFailedLogin(subjects);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.passwordHash) {
      await recordFailedLogin(subjects);
      return res.status(400).json({ message: 'This account uses Google sign-in.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await recordFailedLogin(subjects);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    await clearFailedLogin(subjects);
    return res.json(createSession(user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const googleProfile = await verifyGoogleCredential(req.body.credential);
    const linkedUser = await User.findOne({ googleId: googleProfile.googleId });
    if (linkedUser) return res.json(createSession(linkedUser));

    const emailMatches = await findEmailMatches(googleProfile.email);
    if (emailMatches.length) return sendExistingAccountConflict(res, emailMatches);

    const user = new User({
      name: googleProfile.name,
      email: googleProfile.email,
      googleId: googleProfile.googleId,
    });
    try {
      await user.save();
    } catch (error) {
      if (error.code !== 11000) throw error;

      const racedGoogleUser = await User.findOne({ googleId: googleProfile.googleId });
      if (racedGoogleUser) return res.json(createSession(racedGoogleUser));

      const racedEmailMatches = await findEmailMatches(googleProfile.email);
      if (racedEmailMatches.length) return sendExistingAccountConflict(res, racedEmailMatches);
      throw error;
    }

    return res.status(201).json(createSession(user));
  } catch (error) {
    return sendControllerError(res, error);
  }
};

exports.linkGoogle = async (req, res) => {
  try {
    const googleProfile = await verifyGoogleCredential(req.body.credential);
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Account not found.' });

    if (normalizeEmail(user.email) !== googleProfile.email) {
      return res.status(403).json({
        code: 'GOOGLE_EMAIL_MISMATCH',
        message: 'Sign in to Google with the same email address as this account.',
      });
    }

    const emailMatches = await findEmailMatches(googleProfile.email);
    if (emailMatches.length !== 1 || !emailMatches[0]._id.equals(user._id)) {
      return res.status(409).json({
        code: 'AMBIGUOUS_ACCOUNT_EMAIL',
        message: 'More than one account matches this email. Please contact support before linking Google.',
      });
    }

    if (user.googleId && user.googleId !== googleProfile.googleId) {
      return res.status(409).json({
        code: 'GOOGLE_ACCOUNT_ALREADY_LINKED',
        message: 'A different Google account is already linked to this account.',
      });
    }

    const otherLinkedUser = await User.findOne({
      googleId: googleProfile.googleId,
      _id: { $ne: user._id },
    });
    if (otherLinkedUser) {
      return res.status(409).json({
        code: 'GOOGLE_ACCOUNT_ALREADY_LINKED',
        message: 'This Google account is already linked to another Habit Tracker account.',
      });
    }

    user.googleId = googleProfile.googleId;
    try {
      await user.save();
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          code: 'GOOGLE_ACCOUNT_ALREADY_LINKED',
          message: 'This Google account is already linked to another Habit Tracker account.',
        });
      }
      throw error;
    }

    return res.json({ user: publicUser(user) });
  } catch (error) {
    return sendControllerError(res, error);
  }
};
