const mongoose = require('mongoose');

const habitLogSchema = new mongoose.Schema({
  habitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Habit', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // Format YYYY-MM-DD
  completedAt: { type: Date, default: Date.now },
});

// Ensure a habit can only be logged once per day per user
habitLogSchema.index({ habitId: 1, userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('HabitLog', habitLogSchema);
