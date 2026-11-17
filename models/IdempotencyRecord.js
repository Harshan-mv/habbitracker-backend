const mongoose = require('mongoose');

const idempotencyRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true, maxlength: 200 },
  route: { type: String, required: true },
  requestHash: { type: String, required: true },
  status: { type: String, enum: ['in-progress', 'completed'], required: true },
  responseStatus: { type: Number },
  responseBody: { type: mongoose.Schema.Types.Mixed },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

idempotencyRecordSchema.index({ userId: 1, key: 1 }, { unique: true });
idempotencyRecordSchema.index({ userId: 1, expiresAt: 1 });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);
