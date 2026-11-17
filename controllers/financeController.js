const Finance = require('../models/Finance');
const Goal = require('../models/Goal');
const GoalAllocation = require('../models/GoalAllocation');
const { hardCap } = require('../utils/pagination');
const { invalidateUser } = require('../utils/cache');

const getIncludedGoalAllocations = async (userId, month) => {
  const activeGoals = await Goal.find({
    userId,
    status: { $in: ['active', 'completed'] },
  }).select('_id').lean();
  if (!activeGoals.length) return 0;
  const allocations = await GoalAllocation.find({
    userId,
    goalId: { $in: activeGoals.map((goal) => goal._id) },
    month,
  }).select('amount').lean();
  return allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
};

// Helper: get or create a finance doc for user + month
const getOrCreate = async (userId, month) => {
  let doc = await Finance.findOne({ userId, month });
  if (!doc) {
    // Check previous month for carry-forward
    const [y, m] = month.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevDoc = await Finance.findOne({ userId, month: prevMonth });

    let carryForward = 0;
    let prevSavingsAchieved = 0;
    let prevEmergencyAchieved = 0;
    let emergencyTarget = 100000;
    let savingsTarget = 0;
    let emiMonthsLeft = 0;
    let emiTotalMonths = 0;

    if (prevDoc) {
      const prevIncome = prevDoc.incomes.reduce((s, i) => s + i.amount, 0) + (prevDoc.carryForward || 0);
      const prevExpenses = prevDoc.expenses.reduce((s, e) => s + e.amount, 0);
      const prevSavingsGoal = prevDoc.savingsGoal || 0;
      const prevEmergencyFund = prevDoc.emergencyFund || 0;
      const prevCustomGoalAllocations = await getIncludedGoalAllocations(userId, prevMonth);
      carryForward = prevIncome - prevExpenses - prevSavingsGoal - prevEmergencyFund - prevCustomGoalAllocations;
      if (carryForward < 0) carryForward = 0;

      // Accumulate total saved from previous month (historical total + previous month's contribution)
      prevSavingsAchieved = (prevDoc.prevSavingsAchieved || 0) + prevSavingsGoal;
      prevEmergencyAchieved = (prevDoc.prevEmergencyAchieved || 0) + prevEmergencyFund;
      
      savingsTarget = prevDoc.savingsTarget || 0;
      emergencyTarget = prevDoc.emergencyTarget || 100000;
      emiMonthsLeft = Math.max((prevDoc.emiMonthsLeft || 0) - 1, 0);
      emiTotalMonths = prevDoc.emiTotalMonths || 0;
    }

    try {
      doc = await Finance.create({
        userId,
        month,
        incomes: [],
        expenses: [],
        carryForward,
        prevSavingsAchieved,
        savingsAchieved: prevSavingsAchieved,
        savingsTarget,
        prevEmergencyAchieved,
        emergencyAchieved: prevEmergencyAchieved,
        emergencyTarget,
        emiMonthsLeft,
        emiTotalMonths,
      });
    } catch (err) {
      if (err.code === 11000) { // Duplicate key error
        doc = await Finance.findOne({ userId, month });
      } else {
        throw err;
      }
    }
  }
  return doc;
};

// GET /api/finance/:month
exports.getMonth = async (req, res) => {
  try {
    const doc = await getOrCreate(req.user.userId, req.params.month);
    const financeItemsLimit = hardCap('FINANCE_ITEMS_HARD_CAP', 1000);
    if (doc.incomes.length + doc.expenses.length > financeItemsLimit) {
      return res.status(413).json({ error: `Monthly finance items exceed the configured limit of ${financeItemsLimit}` });
    }
    
    // Auto-sync from previous month just in case it was updated
    const [y, m] = req.params.month.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevDoc = await Finance.findOne({ userId: req.user.userId, month: prevMonthStr });
    
    if (prevDoc) {
      // Recalculate carryForward
      const prevIncome = prevDoc.incomes.reduce((s, i) => s + i.amount, 0) + (prevDoc.carryForward || 0);
      const prevExpenses = prevDoc.expenses.reduce((s, e) => s + e.amount, 0);
      const prevSavingsGoal = prevDoc.savingsGoal || 0;
      const prevEmergencyFund = prevDoc.emergencyFund || 0;
      const prevCustomGoalAllocations = await getIncludedGoalAllocations(req.user.userId, prevMonthStr);
      let cf = prevIncome - prevExpenses - prevSavingsGoal - prevEmergencyFund - prevCustomGoalAllocations;
      doc.carryForward = Math.max(0, cf);

      // Recalculate achieved totals
      doc.prevSavingsAchieved = (prevDoc.prevSavingsAchieved || 0) + prevSavingsGoal;
      doc.prevEmergencyAchieved = (prevDoc.prevEmergencyAchieved || 0) + prevEmergencyFund;
      
      // Update targets if currently 0
      if (doc.savingsTarget === 0 && prevDoc.savingsTarget > 0) doc.savingsTarget = prevDoc.savingsTarget;
      if (doc.emergencyTarget === 0 || doc.emergencyTarget === 100000) {
          doc.emergencyTarget = prevDoc.emergencyTarget || 100000;
      }
      
      // Compute current achieved
      doc.savingsAchieved = doc.prevSavingsAchieved + (doc.savingsGoal || 0);
      doc.emergencyAchieved = doc.prevEmergencyAchieved + (doc.emergencyFund || 0);
      
      await doc.save();
    }
    
    res.json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error' });
  }
};

// PUT /api/finance/:month — full update of the month document
exports.updateMonth = async (req, res) => {
  try {
    const doc = await getOrCreate(req.user.userId, req.params.month);
    const allowed = [
      'incomes', 'expenses', 'realizedPnL', 'charges',
      'savingsGoal', 'savingsTarget', 'savingsAchieved', 'emergencyFund', 'emergencyAchieved', 'emergencyTarget',
      'emiMonthsLeft', 'emiTotalMonths', 'carryForward', 'prevSavingsAchieved', 'prevEmergencyAchieved', 'note'
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        doc[key] = req.body[key];
      }
    }
    const financeItemsLimit = hardCap('FINANCE_ITEMS_HARD_CAP', 1000);
    if (doc.incomes.length + doc.expenses.length > financeItemsLimit) {
      return res.status(413).json({ error: `Monthly finance items exceed the configured limit of ${financeItemsLimit}` });
    }
    await doc.save();
    invalidateUser(req.user.userId);
    res.json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update finance data' });
  }
};
