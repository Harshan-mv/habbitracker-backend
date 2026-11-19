const mongoose = require('mongoose');
const Goal = require('../models/Goal');
const GoalAllocation = require('../models/GoalAllocation');
const { hardCap } = require('../utils/pagination');
const { invalidateUser } = require('../utils/cache');

const GOAL_TYPES = ['Travel', 'Gadget', 'Vehicle', 'Education', 'Wedding', 'Home', 'Gift', 'Custom'];
const ICONS = ['Plane', 'Smartphone', 'CarFront', 'GraduationCap', 'Heart', 'House', 'Gift', 'Target'];
const isMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const isAmount = (value, allowZero = true) => (
  typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)
);
const getUserId = (req) => req.user.userId;

const withTotals = (goal, month, allocations) => {
  const goalAllocations = allocations.filter((allocation) => String(allocation.goalId) === String(goal._id));
  const monthAllocation = goalAllocations.find((allocation) => allocation.month === month)?.amount || 0;
  const savedBefore = goalAllocations
    .filter((allocation) => allocation.month < month)
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  return {
    ...goal.toObject(),
    monthAllocation,
    savedBefore,
    savedTotal: savedBefore + monthAllocation,
  };
};

exports.listGoals = async (req, res) => {
  const { month } = req.query;
  if (!isMonth(month)) return res.status(400).json({ error: 'A valid month (YYYY-MM) is required' });

  try {
    const userId = getUserId(req);
    const goalLimit = hardCap('GOALS_HARD_CAP', 500);
    const goalCount = await Goal.countDocuments({ userId });
    if (goalCount > goalLimit) {
      return res.status(413).json({ error: `Goal list exceeds the configured limit of ${goalLimit}` });
    }
    const goals = await Goal.find({ userId }).sort({ order: 1, createdAt: 1 }).limit(goalLimit + 1);
    if (goals.length > goalLimit) {
      return res.status(413).json({ error: `Goal list exceeds the configured limit of ${goalLimit}` });
    }
    const allocations = goals.length
      ? await GoalAllocation.find({
        userId,
        goalId: { $in: goals.map((goal) => goal._id) },
        month: { $lte: month },
      }).lean()
      : [];
    res.json(goals.map((goal) => withTotals(goal, month, allocations)));
  } catch (error) {
    console.error('Failed to load finance goals:', error);
    res.status(500).json({ error: 'Failed to load finance goals' });
  }
};

exports.createGoal = async (req, res) => {
  const { name, type, icon, color, targetAmount, deadline, note = '', month, monthlyAllocation = 0 } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    return res.status(400).json({ error: 'Goal name is required and must be 80 characters or fewer' });
  }
  if (!GOAL_TYPES.includes(type) || !ICONS.includes(icon)) {
    return res.status(400).json({ error: 'Choose a valid goal type and icon' });
  }
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Choose a valid hex color' });
  }
  if (!isAmount(targetAmount, false) || !isAmount(monthlyAllocation)) {
    return res.status(400).json({ error: 'Target must be above zero and allocation cannot be negative' });
  }
  if (!isMonth(month)) return res.status(400).json({ error: 'A valid month (YYYY-MM) is required' });
  if (deadline && Number.isNaN(new Date(deadline).getTime())) {
    return res.status(400).json({ error: 'Enter a valid deadline' });
  }
  if (typeof note !== 'string' || note.length > 1000) {
    return res.status(400).json({ error: 'Goal note must be 1,000 characters or fewer' });
  }

  try {
    const userId = getUserId(req);
    const goalLimit = hardCap('GOALS_HARD_CAP', 500);
    if (await Goal.countDocuments({ userId }) >= goalLimit) {
      return res.status(413).json({ error: `Goal limit of ${goalLimit} reached` });
    }
    const order = await Goal.countDocuments({ userId });
    const goal = await Goal.create({
      userId,
      name: name.trim(),
      type,
      icon,
      color,
      targetAmount,
      deadline: deadline || null,
      note,
      order,
      status: monthlyAllocation >= targetAmount ? 'completed' : 'active',
    });

    try {
      if (monthlyAllocation > 0) {
        await GoalAllocation.create({ userId, goalId: goal._id, month, amount: monthlyAllocation });
      }
    } catch (allocationError) {
      await Goal.deleteOne({ _id: goal._id, userId });
      throw allocationError;
    }

    res.status(201).json({
      ...goal.toObject(),
      monthAllocation: monthlyAllocation,
      savedBefore: 0,
      savedTotal: monthlyAllocation,
    });
    invalidateUser(userId);
  } catch (error) {
    console.error('Failed to create finance goal:', error);
    res.status(500).json({ error: 'Failed to create finance goal' });
  }
};

exports.updateGoal = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid goal id' });
  const allowed = ['name', 'type', 'icon', 'color', 'targetAmount', 'deadline', 'note', 'status', 'order'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim() || updates.name.trim().length > 80)) {
    return res.status(400).json({ error: 'Goal name is required and must be 80 characters or fewer' });
  }
  if (updates.type !== undefined && !GOAL_TYPES.includes(updates.type)) {
    return res.status(400).json({ error: 'Choose a valid goal type' });
  }
  if (updates.icon !== undefined && !ICONS.includes(updates.icon)) {
    return res.status(400).json({ error: 'Choose a valid goal icon' });
  }
  if (updates.color !== undefined && (typeof updates.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(updates.color))) {
    return res.status(400).json({ error: 'Choose a valid hex color' });
  }
  if (updates.targetAmount !== undefined && !isAmount(updates.targetAmount, false)) {
    return res.status(400).json({ error: 'Target amount must be above zero' });
  }
  if (updates.deadline && Number.isNaN(new Date(updates.deadline).getTime())) {
    return res.status(400).json({ error: 'Enter a valid deadline' });
  }
  if (updates.note !== undefined && (typeof updates.note !== 'string' || updates.note.length > 1000)) {
    return res.status(400).json({ error: 'Goal note must be 1,000 characters or fewer' });
  }
  if (updates.status !== undefined && !['active', 'paused', 'completed', 'archived'].includes(updates.status)) {
    return res.status(400).json({ error: 'Choose a valid goal status' });
  }
  if (updates.name) updates.name = updates.name.trim();

  try {
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      { $set: updates },
      { returnDocument: 'after', runValidators: true },
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const contributions = await GoalAllocation.find({ userId: getUserId(req), goalId: goal._id }).select('amount').lean();
    const savedTotal = contributions.reduce((sum, contribution) => sum + contribution.amount, 0);
    if (!['paused', 'archived'].includes(goal.status)) {
      goal.status = savedTotal >= goal.targetAmount ? 'completed' : 'active';
      await goal.save();
    }
    invalidateUser(getUserId(req));
    res.json(goal);
  } catch (error) {
    console.error('Failed to update finance goal:', error);
    res.status(500).json({ error: 'Failed to update finance goal' });
  }
};

exports.updateAllocation = async (req, res) => {
  const { month } = req.params;
  const { amount } = req.body;
  if (!isMonth(month) || !isAmount(amount)) {
    return res.status(400).json({ error: 'Enter a valid month and non-negative allocation' });
  }

  try {
    const userId = getUserId(req);
    const goal = await Goal.findOne({ _id: req.params.id, userId });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (['paused', 'archived'].includes(goal.status) && amount > 0) {
      return res.status(409).json({ error: 'Resume this goal before adding an allocation' });
    }

    await GoalAllocation.findOneAndUpdate(
      { goalId: goal._id, month },
      { $set: { userId, amount } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    );

    const allAllocations = await GoalAllocation.find({ userId, goalId: goal._id }).lean();
    const allocations = allAllocations.filter((allocation) => allocation.month <= month);
    const savedTotal = allAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (!['paused', 'archived'].includes(goal.status)) {
      goal.status = savedTotal >= goal.targetAmount ? 'completed' : 'active';
      await goal.save();
    }
    invalidateUser(userId);
    res.json(withTotals(goal, month, allocations));
  } catch (error) {
    console.error('Failed to update goal allocation:', error);
    res.status(500).json({ error: 'Failed to update goal allocation' });
  }
};

exports.deleteGoal = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid goal id' });

  try {
    const userId = getUserId(req);
    const goal = await Goal.findOneAndDelete({ _id: req.params.id, userId });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    await GoalAllocation.deleteMany({ goalId: goal._id, userId });
    invalidateUser(userId);
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    console.error('Failed to delete finance goal:', error);
    res.status(500).json({ error: 'Failed to delete finance goal' });
  }
};
