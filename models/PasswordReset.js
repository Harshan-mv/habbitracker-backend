const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  codeHash: { type: String, default: null },
  attempts: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true },
  lastSentAt: { type: Date, required: true },
  resetTokenHash: { type: String, default: null },
}, { timestamps: true });

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
