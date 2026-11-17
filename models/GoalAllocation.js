const mongoose = require('mongoose');

const goalAllocationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    required: true,
  },
  month: {
    type: String,
    required: true,
    match: /^\d{4}-(0[1-9]|1[0-2])$/,
  },
  amount: { type: Number, required: true, min: 0 },
}, { timestamps: true });

goalAllocationSchema.index({ goalId: 1, month: 1 }, { unique: true });
goalAllocationSchema.index({ userId: 1, month: 1 });

module.exports = mongoose.model('GoalAllocation', goalAllocationSchema);
