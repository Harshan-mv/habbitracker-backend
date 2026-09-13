const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const auth = require('../middleware/authMiddleware');

// Route to get VAPID public key
router.get('/vapidPublicKey', (req, res) => {
  res.send(process.env.VAPID_PUBLIC_KEY);
});

// Route to subscribe
router.post('/subscribe', auth, async (req, res) => {
  const subscription = req.body;
  const userId = req.user.id; // assuming auth middleware is used before this

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
router.post('/unsubscribe', auth, async (req, res) => {
  const { endpoint } = req.body;
  try {
    await Subscription.deleteOne({ endpoint });
    res.status(200).json({ message: 'Unsubscribed successfully.' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to unsubscribe.' });
  }
});

module.exports = router;
