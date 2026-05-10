const { Message, Conversation } = require('../models/Message');
const Session = require('../models/Session');
const SessionRequest = require('../models/SessionRequest');

/**
 * ------------------------------------------------------------
 * Helper: Check whether two users are allowed to chat
 * ------------------------------------------------------------
 */
async function canUsersChat(userId1, userId2) {
    // Accepted/confirmed session request
    const acceptedRequest = await SessionRequest.findOne({
        $or: [
            { student: userId1, teacher: userId2 },
            { student: userId2, teacher: userId1 }
        ],
        status: 'confirmed'
    });

    if (acceptedRequest) return true;

    // Existing session
    const session = await Session.findOne({
        $or: [
            { student: userId1, teacher: userId2 },
            { student: userId2, teacher: userId1 }
        ],
        status: {
            $in: ['confirmed', 'ongoing', 'completed']
        }
    });

    return !!session;
}

/**
 * ------------------------------------------------------------
 * PAGE: Render Messages Dashboard
 * GET /messages
 * ------------------------------------------------------------
 */
exports.getMessagesPage = async (req, res) => {
    try {
        const currentUserId = req.user._id.toString();

        const conversations = await Conversation.find({
            participants: req.user._id
        })
            .populate('participants', 'name email')
            .populate({
                path: 'lastMessage',
                match: { isDeleted: { $ne: true } },
                populate: {
                    path: 'sender',
                    select: 'name'
                }
            })
            .sort({ lastMessageAt: -1 });

        const conversationList = [];

        for (const conversation of conversations) {
            const otherUser = conversation.participants.find(
                p => p._id.toString() !== currentUserId
            );

            if (!otherUser) continue;

         conversationList.push({
    _id: conversation._id,
    otherUser,
    lastMessage: conversation.lastMessage || null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount:
        (conversation.unreadCount &&
            conversation.unreadCount.get(currentUserId)) || 0
});
        }

       res.render('messages', {
    user: req.user,
    activePage: 'messages',
    conversations: conversationList
});
    } catch (error) {
        console.error('Get messages page error:', error);
        res.status(500).send('Failed to load messages page');
    }
};

/**
 * ------------------------------------------------------------
 * API: Check Chat Access
 * GET /api/messages/check/:userId
 * ------------------------------------------------------------
 */
exports.checkChatAccess = async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        const currentUserId = req.user._id;

        if (String(otherUserId) === String(currentUserId)) {
            return res.json({
                success: true,
                data: {
                    canChat: false,
                    message: 'You cannot chat with yourself'
                }
            });
        }

        const allowed = await canUsersChat(currentUserId, otherUserId);

        res.json({
            success: true,
            data: {
                canChat: allowed,
                message: allowed
                    ? 'Chat allowed'
                    : 'You can only chat after a session is accepted'
            }
        });
    } catch (error) {
        console.error('Check chat access error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check chat access'
        });
    }
};

/**
 * ------------------------------------------------------------
 * API: Get or Create Conversation by Other User ID
 * GET /api/messages/conversation/:userId
 * ------------------------------------------------------------
 */
exports.getOrCreateConversation = async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        const currentUserId = req.user._id;

        const allowed = await canUsersChat(currentUserId, otherUserId);

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: 'Chat not allowed'
            });
        }

        let conversation = await Conversation.findOne({
            participants: {
                $all: [currentUserId, otherUserId],
                $size: 2
            }
        });

        if (!conversation) {
            // Determine roles if a session exists
             conversation = await Conversation.create({
              participants: [currentUserId, otherUserId]
              });
        }

        const messages = await Message.find({
            $or: [
                {
                    sender: currentUserId,
                    receiver: otherUserId
                },
                {
                    sender: otherUserId,
                    receiver: currentUserId
                }
            ],
            isDeleted: { $ne: true }
        })
            .populate('sender', 'name email')
            .populate('receiver', 'name email')
            .sort({ createdAt: 1 });

        res.json({
            success: true,
            data: {
                conversation,
                messages
            }
        });
    } catch (error) {
        console.error('Get or create conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load conversation'
        });
    }
};

/**
 * ------------------------------------------------------------
 * API: Get All Conversations
 * GET /api/messages/conversations
 * ------------------------------------------------------------
 */
exports.getConversations = async (req, res) => {
    try {
        const currentUserId = req.user._id.toString();

        const conversations = await Conversation.find({
            participants: req.user._id
        })
            .populate('participants', 'name email')
            .populate({
                path: 'lastMessage',
                match: { isDeleted: { $ne: true } }
            })
            .sort({ lastMessageAt: -1 });

       const conversationList = [];

        for (const conversation of conversations) {
            const otherUser = conversation.participants.find(
                p => p._id.toString() !== currentUserId
            );

            if (!otherUser) continue;

            conversationList.push({
    _id: conversation._id,
    otherUser,
    lastMessage: conversation.lastMessage || null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount:
        (conversation.unreadCount &&
            conversation.unreadCount.get(currentUserId)) || 0
});
        }

        res.json({
             success: true,
             data: conversationList
             });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load conversations'
        });
    }
};

/**
 * ------------------------------------------------------------
 * API: Get Messages of One Conversation
 * GET /api/messages/conversations/:conversationId/messages
 * ------------------------------------------------------------
 */
exports.getConversationMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: req.user._id
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const [user1, user2] = conversation.participants;

        const messages = await Message.find({
            $or: [
                { sender: user1, receiver: user2 },
                { sender: user2, receiver: user1 }
            ],
            isDeleted: { $ne: true }
        })
            .populate('sender', 'name email')
            .populate('receiver', 'name email')
            .sort({ createdAt: 1 });

        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        console.error('Get conversation messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load messages'
        });
    }
};

/**
 * ------------------------------------------------------------
 * API: Send Message
 * POST /api/messages/message
 * ------------------------------------------------------------
 */
exports.sendMessage = async (req, res) => {
    try {
        const { receiverId, content, type = 'text' } = req.body;
        const senderId = req.user._id;

        if (!receiverId || !content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        const allowed = await canUsersChat(senderId, receiverId);

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: 'Chat not allowed'
            });
        }

        let conversation = await Conversation.findOne({
            participants: {
                $all: [senderId, receiverId],
                $size: 2
            }
        });

        if (!conversation) {
            conversation = await Conversation.create({
               participants: [senderId, receiverId]
                 });
        }

        let message = await Message.create({
            sender: senderId,
            receiver: receiverId,
            content: content.trim(),
            type,
            isFree: true,
            creditsCost: 0
        });

        message = await Message.findById(message._id)
            .populate('sender', 'name email')
            .populate('receiver', 'name email');

        conversation.lastMessage = message._id;
        conversation.lastMessageAt = new Date();

        const currentUnread =
            (conversation.unreadCount &&
                conversation.unreadCount.get(receiverId.toString())) || 0;

        if (!conversation.unreadCount) {
            conversation.unreadCount = new Map();
        }

        conversation.unreadCount.set(
            receiverId.toString(),
            currentUnread + 1
        );

        await conversation.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`user_${receiverId}`).emit('new_message', {
                conversationId: conversation._id.toString(),
                message
            });
        }

        res.status(201).json({
            success: true,
            data: message
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
};

/**
 * ------------------------------------------------------------
 * API: Delete Single Message
 * DELETE /api/messages/message/:messageId
 * ------------------------------------------------------------
 */
exports.deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await Message.findOne({
            _id: messageId,
            sender: req.user._id
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        message.isDeleted = true;
        message.deletedAt = new Date();
        await message.save();

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete message'
        });
    }
};

/**
 * ------------------------------------------------------------
 * API: Delete Entire Conversation
 * DELETE /api/messages/conversations/:conversationId
 * ------------------------------------------------------------
 */
exports.deleteConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: req.user._id
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const [user1, user2] = conversation.participants;

        await Message.updateMany(
            {
                $or: [
                    { sender: user1, receiver: user2 },
                    { sender: user2, receiver: user1 }
                ]
            },
            {
                isDeleted: true,
                deletedAt: new Date()
            }
        );

        await Conversation.deleteOne({ _id: conversationId });

        res.json({
            success: true,
            message: 'Conversation deleted successfully'
        });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete conversation'
        });
    }
};

/**
 * ------------------------------------------------------------
 * API: Mark Conversation as Read
 * PUT /api/messages/conversations/:conversationId/read
 * ------------------------------------------------------------
 */
exports.markConversationAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params;

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: req.user._id
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        if (!conversation.unreadCount) {
            conversation.unreadCount = new Map();
        }

        conversation.unreadCount.set(req.user._id.toString(), 0);
        await conversation.save();

        await Message.updateMany(
            {
                receiver: req.user._id,
                isRead: false
            },
            {
                isRead: true,
                readAt: new Date()
            }
        );

        res.json({
            success: true,
            message: 'Conversation marked as read'
        });
    } catch (error) {
        console.error('Mark conversation as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark conversation as read'
        });
    }
};