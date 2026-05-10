const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const messageController = require('../controllers/messageController');

// All routes require authentication
router.use(protect);

// ======================================
// PAGE ROUTE
// ======================================

// Render Messages Dashboard
// URL: /messages
router.get('/', messageController.getMessagesPage);

// ======================================
// SHARED CHAT API ROUTES
// ======================================

// Check if current user can chat with another user
// URL: /api/messages/check/:userId
router.get('/check/:userId', messageController.checkChatAccess);

// Get existing conversation or create one
// URL: /api/messages/conversation/:userId
router.get(
    '/conversation/:userId',
    messageController.getOrCreateConversation
);

// Send a new message
// URL: /api/messages/message
router.post('/message', messageController.sendMessage);

// Delete a single message
// URL: /api/messages/message/:messageId
router.delete(
    '/message/:messageId',
    messageController.deleteMessage
);

// ======================================
// DASHBOARD API ROUTES
// ======================================

// Get all conversations grouped as Teacher/Student
router.get(
    '/conversations',
    messageController.getConversations
);

// Get all messages of one conversation
router.get(
    '/conversations/:conversationId/messages',
    messageController.getConversationMessages
);

// Delete entire conversation
router.delete(
    '/conversations/:conversationId',
    messageController.deleteConversation
);

// Mark conversation as read
router.put(
    '/conversations/:conversationId/read',
    messageController.markConversationAsRead
);

module.exports = router;