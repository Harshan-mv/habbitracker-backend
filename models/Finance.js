const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  amount: { type: Number, required: true },
});

const expenseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  category: {
    type: String,
    enum: ['EMI', 'Transport', 'Food', 'Health', 'Investment', 'Entertainment', 'Emergency Fund', 'Other'],
    default: 'Other',
  },
});

const financeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  month: {
    type: String, // "YYYY-MM"
    required: true,
  },
  incomes: [incomeSchema],
  expenses: [expenseSchema],
  realizedPnL: { type: Number, default: 0 },
  charges: { type: Number, default: 0 },
  savingsGoal: { type: Number, default: 0 },
  savingsAchieved: { type: Number, default: 0 },
  emergencyFund: { type: Number, default: 0 },
  emergencyAchieved: { type: Number, default: 0 },
  emergencyTarget: { type: Number, default: 0 },
  emiMonthsLeft: { type: Number, default: 0 },
  emiTotalMonths: { type: Number, default: 0 },
  carryForward: { type: Number, default: 0 },
}, { timestamps: true });

// One document per user per month
financeSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Finance', financeSchema);
