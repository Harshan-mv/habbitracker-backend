const Habit = require('../models/Habit');
const { getPagination, setPaginationHeaders, hardCap } = require('../utils/pagination');
const { invalidateUser } = require('../utils/cache');

exports.getHabits = async (req, res) => {
  try {
    const filter = { userId: req.user.userId, isArchived: false };
    const pagination = getPagination(req);
    if (!pagination.valid) return res.status(400).json({ error: 'Page and limit must be positive integers' });
    const total = await Habit.countDocuments(filter);
    const maximum = hardCap('HABITS_HARD_CAP', 1000);
    if (!pagination.requested && total > maximum) {
      return res.status(413).json({ error: `Habit list exceeds the configured limit of ${maximum}` });
    }
    let query = Habit.find(filter).sort({ createdAt: 1 });
    if (pagination.requested) {
      setPaginationHeaders(res, total, pagination.page, pagination.limit);
      query = query.skip((pagination.page - 1) * pagination.limit).limit(pagination.limit);
    } else {
      query = query.limit(maximum + 1);
    }
    const habits = await query;
    if (!pagination.requested && habits.length > maximum) {
      return res.status(413).json({ error: `Habit list exceeds the configured limit of ${maximum}` });
    }
    res.json(habits);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createHabit = async (req, res) => {
  try {
    const { name, color } = req.body;
    const newHabit = new Habit({
      userId: req.user.userId,
      name,
      color,
    });
    const habit = await newHabit.save();
    invalidateUser(req.user.userId);
    res.status(201).json(habit);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateHabit = async (req, res) => {
  try {
    const { name, color } = req.body;
    let habit = await Habit.findOne({ _id: req.params.id, userId: req.user.userId });
    
    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    if (name) habit.name = name;
    if (color) habit.color = color;
    
    await habit.save();
    invalidateUser(req.user.userId);
    res.json(habit);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteHabit = async (req, res) => {
  try {
    let habit = await Habit.findOne({ _id: req.params.id, userId: req.user.userId });
    
    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    habit.isArchived = true;
    await habit.save();
    invalidateUser(req.user.userId);
    res.json({ message: 'Habit archived' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
