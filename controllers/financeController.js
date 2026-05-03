const Finance = require('../models/Finance');

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
    let emiMonthsLeft = 0;
    let emiTotalMonths = 0;

    if (prevDoc) {
      const prevIncome = prevDoc.incomes.reduce((s, i) => s + i.amount, 0) + (prevDoc.carryForward || 0);
      const prevExpenses = prevDoc.expenses.reduce((s, e) => s + e.amount, 0);
      const prevSavingsGoal = prevDoc.savingsGoal || 0;
      const prevEmergencyFund = prevDoc.emergencyFund || 0;
      carryForward = prevIncome - prevExpenses - prevSavingsGoal - prevEmergencyFund;
      if (carryForward < 0) carryForward = 0;

      prevSavingsAchieved = (prevDoc.savingsAchieved || 0) + prevSavingsGoal;
      prevEmergencyAchieved = (prevDoc.emergencyAchieved || 0) + prevEmergencyFund;
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
        savingsAchieved: prevSavingsAchieved,
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
      'savingsGoal', 'savingsAchieved', 'emergencyFund', 'emergencyAchieved', 'emergencyTarget',
      'emiMonthsLeft', 'emiTotalMonths', 'carryForward',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        doc[key] = req.body[key];
      }
    }
    await doc.save();
    res.json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update finance data' });
  }
};

// GET /api/finance/history/:count — get last N months for cashflow chart
exports.getHistory = async (req, res) => {
  try {
    const count = parseInt(req.params.count) || 6;
    const now = new Date();
    const months = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(key);
    }

    const docs = await Finance.find({
      userId: req.user.userId,
      month: { $in: months },
    });

    const docMap = {};
    for (const d of docs) {
      docMap[d.month] = d;
    }

    const result = months.map((m) => {
      const doc = docMap[m];
      if (!doc) {
        return { month: m, income: 0, expenses: 0, savings: 0 };
      }
      const income = doc.incomes.reduce((s, i) => s + i.amount, 0) + doc.carryForward;
      const expenses = doc.expenses.reduce((s, e) => s + e.amount, 0);
      return {
        month: m,
        income,
        expenses,
        savings: income - expenses - doc.savingsGoal - doc.emergencyFund,
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error' });
  }
};
