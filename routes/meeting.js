const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

const {
    joinMeeting,
    getMeetingInfo,
    endMeetingEarlyByStudent,
    endMeetingByTeacher,
    submitRating
} = require('../controllers/meetingController');



router.use(protect);

// Join meeting page
router.get('/join/:sessionId', joinMeeting);

// APIs
router.get('/api/validate/:sessionId', getMeetingInfo);
router.post('/api/end-early/:sessionId', endMeetingEarlyByStudent);
router.post('/api/rate/:sessionId', submitRating);

//Teacher ends meeting
router.post('/api/teacher/sessions/:sessionId/complete', endMeetingByTeacher);

module.exports = router;