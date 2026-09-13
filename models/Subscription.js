const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  endpoint: { type: String, required: true },
  expirationTime: { type: Date, default: null },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  }
}, { timestamps: true });

// Avoid duplicate subscriptions
subscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
