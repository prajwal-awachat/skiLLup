const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    searchTeachers,
    getTeacherById,
    createSessionRequest,
    getStudentSessionRequests,
    getSessionRequestStatus,
    cancelSessionRequest,
    suggestAlternateSlotByStudent,
acceptNegotiatedRequestByStudent,
rejectNegotiatedRequestByStudent,
    getCreditsBalance,
    getAvailableSkills,
    getUpcomingSessions,
    getSessionHistory,
    deleteRejectedRequest
} = require('../controllers/learnController');

const {
    checkChatAccess,
    getOrCreateConversation,
    sendMessage,
    deleteMessage
} = require('../controllers/messageController');
// All routes require authentication
router.use(protect);

// Teacher search and listing
router.get('/teachers/search', searchTeachers);
router.get('/teachers/:teacherId', getTeacherById);

// Skills
router.get('/skills', getAvailableSkills);

// Credits
router.get('/credits', getCreditsBalance);

// Session Requests
router.post('/session-request', createSessionRequest);
router.get('/session-requests', getStudentSessionRequests);
router.get('/session-requests/:requestId/status', getSessionRequestStatus);
router.put('/session-requests/:requestId/cancel', cancelSessionRequest);
router.post('/session-requests/:requestId/suggest', suggestAlternateSlotByStudent);
router.post('/session-requests/:requestId/accept', acceptNegotiatedRequestByStudent);
router.post('/session-requests/:requestId/reject', rejectNegotiatedRequestByStudent);

// Sessions
router.get('/upcoming-sessions', getUpcomingSessions);
router.get('/session-history', getSessionHistory);

// Delete rejected session request
router.delete('/session-requests/:requestId/delete',deleteRejectedRequest);

// Chat Routes
router.get('/chat/check/:userId', checkChatAccess);
router.get('/chat/conversation/:userId', getOrCreateConversation);
router.post('/chat/message', sendMessage);
router.delete('/chat/message/:messageId', deleteMessage);

module.exports = router;