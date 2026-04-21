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
    checkChatAccess,
    getConversation,
    sendMessage,
    getCreditsBalance,
    getAvailableSkills,
    getUpcomingSessions,
    getSessionHistory,
    deleteMessage,
    deleteRejectedRequest
} = require('../controllers/learnController');

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

// Chat
router.get('/chat/check/:teacherId', checkChatAccess);
router.get('/chat/conversation/:teacherId', getConversation);
router.post('/chat/message', sendMessage);
router.delete('/chat/message/:messageId', deleteMessage);
// Delete rejected session request
router.delete('/session-requests/:requestId/delete',deleteRejectedRequest);

module.exports = router;