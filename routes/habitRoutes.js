const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { getHabits, createHabit, updateHabit, deleteHabit } = require('../controllers/habitController');
const { writeLimiter } = require('../middleware/rateLimiters');
const validateBody = require('../middleware/validateBody');
const { habitCreateBody, habitUpdateBody } = require('../middleware/requestSchemas');

router.get('/', auth, getHabits);
router.post('/', auth, writeLimiter, validateBody(habitCreateBody), createHabit);
router.put('/:id', auth, writeLimiter, validateBody(habitUpdateBody), updateHabit);
router.delete('/:id', auth, writeLimiter, deleteHabit);

module.exports = router;
