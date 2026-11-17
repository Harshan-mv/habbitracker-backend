const mongoose = require('mongoose');

const financeCategorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  kind: { type: String, enum: ['expense', 'income'], required: true },
  name: { type: String, required: true, trim: true, maxlength: 40 },
  normalizedName: { type: String, required: true },
  color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
}, { timestamps: true });

financeCategorySchema.index({ userId: 1, kind: 1, normalizedName: 1 }, { unique: true });

module.exports = mongoose.model('FinanceCategory', financeCategorySchema);
