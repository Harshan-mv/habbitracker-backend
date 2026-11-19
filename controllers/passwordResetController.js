const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');

const RESEND_COOLDOWN_MS = 60 * 1000;
const NEUTRAL_RESPONSE = {
  message: 'If an account exists for this email, we sent a 6-digit code.',
};
const INVALID_CODE_RESPONSE = { message: 'That code is invalid or expired. Request a new code and try again.' };
const INVALID_TOKEN_RESPONSE = { message: 'This password reset link is invalid or expired. Request a new code and try again.' };

const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const normalizeEmail = (email) => email.trim().toLowerCase();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const findEmailMatches = (email) => User.find({
  email: new RegExp(`^\\s*${escapeRegExp(email.trim())}\\s*$`, 'i'),
}).limit(2);

const hashResetValue = (purpose, email, value) => crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(`${purpose}:${email}:${value}`)
  .digest('hex');

const safeHashEquals = (expected, actual) => {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === 32
    && actualBuffer.length === 32
    && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

const sendResetEmail = async (email, code, expiryMinutes) => {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
    console.error('Password reset email is not configured.');
    return;
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.MAIL_FROM,
      to: email,
      subject: 'Your Habit Tracker password reset code',
      text: `Your 6-digit password reset code is ${code}. It expires in ${expiryMinutes} minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Your 6-digit password reset code is:</p><p style="font-size:24px;font-weight:600;letter-spacing:4px">${code}</p><p>This code expires in ${expiryMinutes} minutes. If you did not request this, you can ignore this email.</p>`,
    });

    if (error) console.error('Password reset email delivery failed.');
  } catch {
    console.error('Password reset email delivery failed.');
  }
};

const reserveCode = async (email, codeHash, now, expiresAt) => {
  const filter = {
    email,
    lastSentAt: { $lte: new Date(now.getTime() - RESEND_COOLDOWN_MS) },
  };
  const update = {
    $set: {
      codeHash,
      attempts: 0,
      expiresAt,
      lastSentAt: now,
      resetTokenHash: null,
    },
  };

  const existing = await PasswordReset.findOneAndUpdate(filter, update, { returnDocument: 'after' });
  if (existing) return true;

  try {
    await PasswordReset.create({ email, codeHash, attempts: 0, expiresAt, lastSentAt: now });
    return true;
  } catch (error) {
    if (error.code !== 11000) throw error;
    return Boolean(await PasswordReset.findOneAndUpdate(filter, update, { returnDocument: 'after' }));
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const users = await findEmailMatches(email);

    if (users.length === 1) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const now = new Date();
      const expiryMinutes = positiveInteger('OTP_EXPIRY_MINUTES', 10);
      const reserved = await reserveCode(
        email,
        hashResetValue('otp', email, code),
        now,
        new Date(now.getTime() + expiryMinutes * 60 * 1000),
      );

      if (reserved) await sendResetEmail(users[0].email, code, expiryMinutes);
    }

    return res.status(200).json(NEUTRAL_RESPONSE);
  } catch {
    console.error('Password reset request could not be processed.');
    return res.status(500).json({ message: 'We could not process your request. Please try again later.' });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = req.body.code;
    const now = new Date();
    const maxAttempts = positiveInteger('OTP_MAX_ATTEMPTS', 5);
    const reset = await PasswordReset.findOne({
      email,
      codeHash: { $ne: null },
      expiresAt: { $gt: now },
      attempts: { $lt: maxAttempts },
    });

    if (!reset) return res.status(400).json(INVALID_CODE_RESPONSE);

    const suppliedHash = hashResetValue('otp', email, code);
    if (!safeHashEquals(reset.codeHash, suppliedHash)) {
      const attempt = await PasswordReset.findOneAndUpdate({
        _id: reset._id,
        codeHash: reset.codeHash,
        expiresAt: { $gt: now },
        attempts: { $lt: maxAttempts },
      }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });

      if (attempt && attempt.attempts >= maxAttempts) {
        await PasswordReset.updateOne(
          { _id: attempt._id, codeHash: reset.codeHash },
          { $set: { codeHash: null } },
        );
      }

      return res.status(400).json(INVALID_CODE_RESPONSE);
    }

    const resetToken = crypto.randomBytes(32).toString('base64url');
    const resetTokenExpiryMinutes = positiveInteger('RESET_TOKEN_EXPIRY_MINUTES', 10);
    const expiresAt = new Date(now.getTime() + resetTokenExpiryMinutes * 60 * 1000);
    const updated = await PasswordReset.findOneAndUpdate({
      _id: reset._id,
      codeHash: reset.codeHash,
      expiresAt: { $gt: now },
      attempts: { $lt: maxAttempts },
    }, {
      $set: {
        codeHash: null,
        resetTokenHash: hashResetValue('reset-token', email, resetToken),
        expiresAt,
      },
    }, { returnDocument: 'after' });

    if (!updated) return res.status(400).json(INVALID_CODE_RESPONSE);
    return res.json({ resetToken });
  } catch {
    console.error('Password reset code could not be verified.');
    return res.status(500).json({ message: 'We could not verify that code. Please try again.' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const resetToken = req.body.resetToken;
    const now = new Date();
    const reset = await PasswordReset.findOne({
      email,
      resetTokenHash: hashResetValue('reset-token', email, resetToken),
      expiresAt: { $gt: now },
    });

    if (!reset) return res.status(400).json(INVALID_TOKEN_RESPONSE);

    const users = await findEmailMatches(email);
    if (users.length !== 1) return res.status(400).json(INVALID_TOKEN_RESPONSE);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(req.body.password, salt);
    const claimed = await PasswordReset.findOneAndUpdate({
      _id: reset._id,
      resetTokenHash: reset.resetTokenHash,
      expiresAt: { $gt: now },
    }, {
      $set: {
        codeHash: null,
        resetTokenHash: null,
        expiresAt: now,
      },
    }, { returnDocument: 'after' });

    if (!claimed) return res.status(400).json(INVALID_TOKEN_RESPONSE);

    users[0].passwordHash = passwordHash;
    await users[0].save();
    return res.json({ message: 'Password updated. Please sign in.' });
  } catch {
    console.error('Password reset could not be completed.');
    return res.status(500).json({ message: 'We could not update your password. Please try again.' });
  }
};
