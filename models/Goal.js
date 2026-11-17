const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  type: {
    type: String,
    enum: ['Travel', 'Gadget', 'Vehicle', 'Education', 'Wedding', 'Home', 'Gift', 'Custom'],
    required: true,
  },
  icon: { type: String, required: true },
  color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
  targetAmount: { type: Number, required: true, min: 0.01 },
  deadline: { type: Date, default: null },
  isFixed: { type: Boolean, default: false },
  note: { type: String, default: '', maxlength: 1000 },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'archived'],
    default: 'active',
  },
  order: { type: Number, default: 0 },
}, { timestamps: true });

goalSchema.index({ userId: 1, order: 1, createdAt: 1 });

module.exports = mongoose.model('Goal', goalSchema);
