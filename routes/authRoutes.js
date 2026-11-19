const express = require('express');
const router = express.Router();
const { register, login, googleLogin, linkGoogle } = require('../controllers/authController');
const { forgotPassword, verifyOtp, resetPassword } = require('../controllers/passwordResetController');
const { authLimiter } = require('../middleware/rateLimiters');
const authMiddleware = require('../middleware/authMiddleware');
const validateBody = require('../middleware/validateBody');
const {
  registerBody,
  loginBody,
  googleCredentialBody,
  forgotPasswordBody,
  verifyOtpBody,
  resetPasswordBody,
} = require('../middleware/requestSchemas');

router.post('/register', authLimiter, validateBody(registerBody), register);
router.post('/login', authLimiter, validateBody(loginBody), login);
router.post('/google', authLimiter, validateBody(googleCredentialBody), googleLogin);
router.post('/google/link', authLimiter, authMiddleware, validateBody(googleCredentialBody), linkGoogle);
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordBody), forgotPassword);
router.post('/verify-otp', authLimiter, validateBody(verifyOtpBody), verifyOtp);
router.post('/reset-password', authLimiter, validateBody(resetPasswordBody), resetPassword);

module.exports = router;
