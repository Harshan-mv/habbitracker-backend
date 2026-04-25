const HabitLog = require('../models/HabitLog');

exports.getLogs = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { userId: req.user.userId };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    const logs = await HabitLog.find(query);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.markDone = async (req, res) => {
  try {
    const { habitId, date } = req.body;
    const log = new HabitLog({ habitId, userId: req.user.userId, date });
    await log.save();
    res.status(201).json(log);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Already logged for this date' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

exports.unmarkDone = async (req, res) => {
  try {
    const { habitId, date } = req.body;
    await HabitLog.findOneAndDelete({ habitId, userId: req.user.userId, date });
    res.json({ message: 'Log removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
