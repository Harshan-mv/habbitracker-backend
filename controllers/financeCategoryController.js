const mongoose = require('mongoose');
const FinanceCategory = require('../models/FinanceCategory');
const { getPagination, setPaginationHeaders, hardCap } = require('../utils/pagination');
const { invalidateUser } = require('../utils/cache');

const isColor = (value) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const BUILT_IN_NAMES = {
  expense: ['EMI', 'Transport', 'Food', 'Health', 'Investment', 'Entertainment', 'Emergency Fund', 'Other'],
  income: ['Salary', 'Business', 'Investment', 'Other'],
};

exports.listCategories = async (req, res) => {
  try {
    const filter = { userId: req.user.userId };
    const pagination = getPagination(req);
    if (!pagination.valid) return res.status(400).json({ error: 'Page and limit must be positive integers' });
    const total = await FinanceCategory.countDocuments(filter);
    const maximum = hardCap('FINANCE_CATEGORIES_HARD_CAP', 500);
    if (!pagination.requested && total > maximum) {
      return res.status(413).json({ error: `Category list exceeds the configured limit of ${maximum}` });
    }
    let query = FinanceCategory.find(filter)
      .sort({ kind: 1, name: 1 })
      .select('_id kind name color');
    if (pagination.requested) {
      setPaginationHeaders(res, total, pagination.page, pagination.limit);
      query = query.skip((pagination.page - 1) * pagination.limit).limit(pagination.limit);
    } else {
      query = query.limit(maximum + 1);
    }
    const categories = await query;
    if (!pagination.requested && categories.length > maximum) {
      return res.status(413).json({ error: `Category list exceeds the configured limit of ${maximum}` });
    }
    res.json(categories);
  } catch (error) {
    console.error('Failed to load finance categories:', error);
    res.status(500).json({ error: 'Failed to load finance categories' });
  }
};

exports.createCategory = async (req, res) => {
  const { kind, name, color } = req.body;
  if (!['expense', 'income'].includes(kind)) {
    return res.status(400).json({ error: 'Choose expense or income category type' });
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
    return res.status(400).json({ error: 'Category name is required and must be 40 characters or fewer' });
  }
  if (!isColor(color)) return res.status(400).json({ error: 'Choose a valid hex color' });

  try {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (BUILT_IN_NAMES[kind].some((builtIn) => builtIn.toLocaleLowerCase() === normalizedName)) {
      return res.status(409).json({ error: 'That name is already available as a built-in category' });
    }
    const category = await FinanceCategory.create({
      userId: req.user.userId,
      kind,
      name: name.trim(),
      normalizedName,
      color,
    });
    invalidateUser(req.user.userId);
    res.status(201).json({
      _id: category._id,
      kind: category.kind,
      name: category.name,
      color: category.color,
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'That category already exists' });
    console.error('Failed to create finance category:', error);
    res.status(500).json({ error: 'Failed to create finance category' });
  }
};

exports.deleteCategory = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid category id' });

  try {
    const category = await FinanceCategory.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    invalidateUser(req.user.userId);
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Failed to delete finance category:', error);
    res.status(500).json({ error: 'Failed to delete finance category' });
  }
};
