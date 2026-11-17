const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiters');
const validateBody = require('../middleware/validateBody');
const { registerBody, loginBody } = require('../middleware/requestSchemas');

router.post('/register', authLimiter, validateBody(registerBody), register);
router.post('/login', authLimiter, validateBody(loginBody), login);

module.exports = router;
