const mongoose = require('mongoose');

const habitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  color: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  isArchived: { type: Boolean, default: false },
});

habitSchema.index({ userId: 1, isArchived: 1, createdAt: 1 });

module.exports = mongoose.model('Habit', habitSchema);
