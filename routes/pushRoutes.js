const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const auth = require('../middleware/authMiddleware');
const validateBody = require('../middleware/validateBody');
const { pushSubscriptionBody, pushUnsubscribeBody } = require('../middleware/requestSchemas');

// Route to get VAPID public key
router.get('/vapidPublicKey', (req, res) => {
  res.send(process.env.VAPID_PUBLIC_KEY);
});

// Route to subscribe
router.post('/subscribe', auth, validateBody(pushSubscriptionBody), async (req, res) => {
  const subscription = req.body;
  const userId = req.user.userId;

  try {
    await Subscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { ...subscription, userId },
      { upsert: true, new: true }
    );
    res.status(201).json({ message: 'Subscription saved.' });
  } catch (error) {
    console.error('Error saving subscription:', error);
    res.status(500).json({ error: 'Failed to save subscription.' });
  }
});

// Route to unsubscribe
router.post('/unsubscribe', auth, validateBody(pushUnsubscribeBody), async (req, res) => {
  const { endpoint } = req.body;
  try {
    await Subscription.deleteOne({ endpoint, userId: req.user.userId });
    res.status(200).json({ message: 'Unsubscribed successfully.' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to unsubscribe.' });
  }
});

module.exports = router;
