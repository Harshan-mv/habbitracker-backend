const express = require('express');
const categoryController = require('../controllers/financeCategoryController');
const { writeLimiter } = require('../middleware/rateLimiters');
const validateBody = require('../middleware/validateBody');
const { categoryBody } = require('../middleware/requestSchemas');

const router = express.Router();

router.get('/', categoryController.listCategories);
router.post('/', writeLimiter, validateBody(categoryBody), categoryController.createCategory);
router.delete('/:id', writeLimiter, categoryController.deleteCategory);

module.exports = router;
