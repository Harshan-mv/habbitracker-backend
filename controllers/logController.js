const HabitLog = require('../models/HabitLog');
const { getPagination, setPaginationHeaders, hardCap } = require('../utils/pagination');
const { invalidateUser } = require('../utils/cache');

exports.getLogs = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { userId: req.user.userId };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    const pagination = getPagination(req);
    if (!pagination.valid) return res.status(400).json({ error: 'Page and limit must be positive integers' });
    const total = await HabitLog.countDocuments(query);
    const maximum = hardCap('HABIT_LOGS_HARD_CAP', 5000);
    if (!pagination.requested && total > maximum) {
      return res.status(413).json({ error: `Habit history exceeds the configured limit of ${maximum}` });
    }
    let logQuery = HabitLog.find(query);
    if (pagination.requested) {
      setPaginationHeaders(res, total, pagination.page, pagination.limit);
      logQuery = logQuery.sort({ date: 1, _id: 1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit);
    } else {
      logQuery = logQuery.limit(maximum + 1);
    }
    const logs = await logQuery;
    if (!pagination.requested && logs.length > maximum) {
      return res.status(413).json({ error: `Habit history exceeds the configured limit of ${maximum}` });
    }
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
    invalidateUser(req.user.userId);
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
    invalidateUser(req.user.userId);
    res.json({ message: 'Log removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
