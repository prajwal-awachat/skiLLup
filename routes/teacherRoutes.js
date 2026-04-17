const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    // Skill Management
    getTeacherSkills,
    addTeacherSkill,
    updateTeacherSkill,
    removeTeacherSkill,
    
    // Profile Management
    getTeacherProfile,
    updateTeacherProfile,
    
    // Trending Topics
    getTrendingTopics,
    
    // Session Requests
    getIncomingRequests,
    acceptSessionRequest,
    rejectSessionRequest,
    
    // Session Management
    getUpcomingSessions,
    getOngoingSessions,
    getCompletedSessions,
    startSession,
    getSessionDetails,
    completeSession,
    
    // Chat Access Check
    canChatWithStudent, 
    teacherGetConversation,
    teacherSendMessage,
    
    // Credits & Earnings
    getCreditsAndEarnings,
    
    
    // Level Features
    getLevelFeatures,
    updateCreditRate,
    deleteMessage
} = require('../controllers/teacherController');

// All routes require authentication
router.use(protect);

// Skill Management
router.get('/skills', getTeacherSkills);
router.post('/skills', addTeacherSkill);
router.put('/skills/:skillId', updateTeacherSkill);
router.delete('/skills/:skillId', removeTeacherSkill);

// Profile Management
router.get('/profile', getTeacherProfile);
router.put('/profile', updateTeacherProfile);

// Trending Topics
router.get('/trending-topics', getTrendingTopics);

// Session Requests
router.get('/requests/incoming', getIncomingRequests);
router.post('/requests/:requestId/accept', acceptSessionRequest);
router.post('/requests/:requestId/reject', rejectSessionRequest);

// Session Management
router.get('/sessions/upcoming', getUpcomingSessions);
router.get('/sessions/ongoing', getOngoingSessions);
router.get('/sessions/completed', getCompletedSessions);
router.post('/sessions/:sessionId/start', startSession);
router.get('/sessions/:sessionId', getSessionDetails);
router.post('/sessions/:sessionId/complete', completeSession);

// Chat Routes
router.get('/chat/check/:studentId', canChatWithStudent);
router.get('/chat/conversation/:studentId', teacherGetConversation);
router.post('/chat/message', teacherSendMessage);
router.delete('/chat/message/:messageId', deleteMessage);

// Credits & Earnings
router.get('/credits-earnings', getCreditsAndEarnings);



// Level Features
router.get('/level/features', getLevelFeatures);
router.put('/level/credit-rate', updateCreditRate);

module.exports = router;