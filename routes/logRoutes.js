const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { getLogs, markDone, unmarkDone } = require('../controllers/logController');

router.get('/', auth, getLogs);
router.post('/', auth, markDone);
router.delete('/', auth, unmarkDone);

module.exports = router;
