const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { getLogs, markDone, unmarkDone } = require('../controllers/logController');
const { writeLimiter } = require('../middleware/rateLimiters');
const validateBody = require('../middleware/validateBody');
const { habitLogBody } = require('../middleware/requestSchemas');

router.get('/', auth, getLogs);
router.post('/', auth, writeLimiter, validateBody(habitLogBody), markDone);
router.delete('/', auth, writeLimiter, validateBody(habitLogBody), unmarkDone);

module.exports = router;
