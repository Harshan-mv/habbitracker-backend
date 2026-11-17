const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/authMiddleware');
const { writeLimiter } = require('../middleware/rateLimiters');
const idempotency = require('../middleware/idempotency');
const validateBody = require('../middleware/validateBody');
const {
  taskCreateBody,
  taskUpdateBody,
  batchTasksBody,
} = require('../middleware/requestSchemas');

router.use(authMiddleware);

router.get('/', taskController.getTasks);
router.post('/', writeLimiter, idempotency, validateBody(taskCreateBody), taskController.createTask);
router.put('/batch', writeLimiter, validateBody(batchTasksBody), taskController.batchUpdateTasks);
router.put('/:id', writeLimiter, validateBody(taskUpdateBody), taskController.updateTask);
router.delete('/:id', writeLimiter, taskController.deleteTask);

module.exports = router;
