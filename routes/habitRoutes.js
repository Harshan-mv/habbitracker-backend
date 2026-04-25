const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { getHabits, createHabit, updateHabit, deleteHabit } = require('../controllers/habitController');

router.get('/', auth, getHabits);
router.post('/', auth, createHabit);
router.put('/:id', auth, updateHabit);
router.delete('/:id', auth, deleteHabit);

module.exports = router;
