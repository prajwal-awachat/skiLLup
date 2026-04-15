// routes/groupSessionRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    createGroupSession,
    getAvailableGroupSessions,
    getTeacherGroupSessions,
    enrollInGroupSession,
    startGroupSession,
    completeGroupSession,
    joinGroupMeeting
} = require('../controllers/groupSessionController');

// All routes require authentication
router.use(protect);

// Student routes
router.get('/available', getAvailableGroupSessions);
router.post('/:sessionId/enroll', enrollInGroupSession);

// Teacher routes (Level 5+)
router.post('/create', createGroupSession);
router.get('/my-sessions', getTeacherGroupSessions);
router.post('/:sessionId/start', startGroupSession);
router.post('/:sessionId/complete', completeGroupSession);

// Meeting page
router.get('/meeting/:sessionId', joinGroupMeeting);

module.exports = router;