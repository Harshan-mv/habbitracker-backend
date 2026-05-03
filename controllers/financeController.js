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
    if (prevDoc) {
      const prevIncome = prevDoc.incomes.reduce((s, i) => s + i.amount, 0) + prevDoc.carryForward;
      const prevExpenses = prevDoc.expenses.reduce((s, e) => s + e.amount, 0);
      const prevSavingsGoal = prevDoc.savingsGoal;
      const prevEmergencyFund = prevDoc.emergencyFund;
      carryForward = prevIncome - prevExpenses - prevSavingsGoal - prevEmergencyFund;
      if (carryForward < 0) carryForward = 0;
    }

    // Carry forward savings & emergency from previous month
    const prevSavingsAchieved = prevDoc ? prevDoc.savingsAchieved + prevDoc.savingsGoal : 0;
    const prevEmergencyAchieved = prevDoc ? prevDoc.emergencyAchieved + prevDoc.emergencyFund : 0;

    doc = await Finance.create({
      userId,
      month,
      incomes: [],
      expenses: [],
      carryForward,
      savingsAchieved: prevSavingsAchieved,
      emergencyAchieved: prevEmergencyAchieved,
      emergencyTarget: prevDoc ? prevDoc.emergencyTarget : 100000,
      emiMonthsLeft: prevDoc ? Math.max(prevDoc.emiMonthsLeft - 1, 0) : 0,
      emiTotalMonths: prevDoc ? prevDoc.emiTotalMonths : 0,
    });
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
