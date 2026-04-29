const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  dueDate: {
    type: Date,
  },
  timeline: {
    startDate: { type: Date },
    endDate: { type: Date }
  },
  budget: {
    amount: { type: Number, default: 0 },
    currency: { type: String, default: '₹' }
  },
  status: {
    type: String,
    enum: ['Not Started', 'In Progress', 'Done', 'Blocked'],
    default: 'Not Started'
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium'
  },
  order: {
    type: Number,
    default: 0
  },
  remarks: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
