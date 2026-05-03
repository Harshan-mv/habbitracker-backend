const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/history/:count', financeController.getHistory);
router.get('/:month', financeController.getMonth);
router.put('/:month', financeController.updateMonth);

module.exports = router;
