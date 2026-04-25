const Habit = require('../models/Habit');

exports.getHabits = async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.userId, isArchived: false }).sort({ createdAt: 1 });
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
    res.json({ message: 'Habit archived' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
