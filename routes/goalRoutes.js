const express = require('express');
const goalController = require('../controllers/goalController');
const { writeLimiter } = require('../middleware/rateLimiters');
const idempotency = require('../middleware/idempotency');
const validateBody = require('../middleware/validateBody');
const { goalCreateBody, allocationBody, objectBody } = require('../middleware/requestSchemas');

const router = express.Router();

router.get('/', goalController.listGoals);
router.post('/', writeLimiter, idempotency, validateBody(goalCreateBody), goalController.createGoal);
router.put('/:id/allocations/:month', writeLimiter, idempotency, validateBody(allocationBody), goalController.updateAllocation);
router.put('/:id', writeLimiter, idempotency, validateBody(objectBody), goalController.updateGoal);
router.delete('/:id', writeLimiter, idempotency, goalController.deleteGoal);

module.exports = router;
