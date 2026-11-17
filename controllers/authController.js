const User = require('../models/User');
const LoginAttempt = require('../models/LoginAttempt');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

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
        new: true,
        setDefaultsOnInsert: true,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return LoginAttempt.findOneAndUpdate(filter, {
        $inc: { failures: 1 },
        $set: { expiresAt },
      }, { new: true });
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

    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
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

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await recordFailedLogin(subjects);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    await clearFailedLogin(subjects);
    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
