const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authMiddleware = require('../middleware/authMiddleware');
const idempotency = require('../middleware/idempotency');
const validateBody = require('../middleware/validateBody');
const { writeLimiter } = require('../middleware/rateLimiters');
const { financeBody } = require('../middleware/requestSchemas');
const goalRoutes = require('./goalRoutes');
const financeCategoryRoutes = require('./financeCategoryRoutes');

router.use(authMiddleware);

router.use('/goals', goalRoutes);
router.use('/categories', financeCategoryRoutes);

router.get('/:month', financeController.getMonth);
router.put('/:month', writeLimiter, idempotency, validateBody(financeBody), financeController.updateMonth);

module.exports = router;
