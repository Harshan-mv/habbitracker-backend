const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  scope: { type: String, enum: ['account', 'ip'], required: true },
  subjectHash: { type: String, required: true },
  failures: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

loginAttemptSchema.index({ scope: 1, subjectHash: 1 }, { unique: true });
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
