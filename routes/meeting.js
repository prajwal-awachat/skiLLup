const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { joinMeeting, getMeetingInfo, endMeetingEarlyByStudent } = require('../controllers/meetingController');
const { submitRating } = require('../controllers/meetingController');
// Protected routes
router.use(protect);

// Join meeting page
router.get('/join/:sessionId', joinMeeting);

// API to validate join code
router.get('/api/validate/:sessionId', getMeetingInfo);
router.post('/api/end-early/:sessionId', endMeetingEarlyByStudent);
router.post('/api/rate/:sessionId', submitRating);
module.exports = router;