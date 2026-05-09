const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const historyController = require('../controllers/historyController');

router.use(protect);

router.get('/', historyController.getHistoryPage);
router.get('/sessions', historyController.getCompletedSessions);

module.exports = router;