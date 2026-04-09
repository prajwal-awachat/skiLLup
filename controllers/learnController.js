const User = require('../models/User');
const Skill = require('../models/Skill');
const SessionRequest = require('../models/SessionRequest');
const Session = require('../models/Session');
const { Message, Conversation } = require('../models/Message');

// @desc    Search teachers by name or skill
// @route   GET /api/learn/teachers/search
// @access  Private
exports.searchTeachers = async (req, res, next) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        const searchTerm = q || '';
        
        let query = {
            role: 'user', // Teachers are regular users with teaching skills
            isActive: true
        };
        
        if (searchTerm.trim() !== '') {
            // Get skills matching the search term
            const matchingSkills = await Skill.find({
                name: { $regex: searchTerm, $options: 'i' }
            }).select('_id');
            
            const skillIds = matchingSkills.map(skill => skill._id);
            
            query.$or = [
                { name: { $regex: searchTerm, $options: 'i' } },
                { teachingSkills: { $in: skillIds } }
            ];
        } else {
            // Only show users with at least one teaching skill
            query.teachingSkills = { $exists: true, $ne: [] };
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const teachers = await User.find(query)
            .select('name email avatar bio rating totalReviews teachingSkills studentsCount level customCreditRate isActive')
            .populate('teachingSkills', 'name category description')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ rating: -1, totalReviews: -1 });
        
        // Get pending/accepted/rejected requests for current student
        const existingRequests = await SessionRequest.find({
            student: req.user.id,
            teacher: { $in: teachers.map(t => t._id) }
        }).select('teacher status');
        
        const requestMap = {};
        existingRequests.forEach(req => {
            requestMap[req.teacher.toString()] = req.status;
        });
        
        // Enhance teacher data with request status
        const teachersWithStatus = teachers.map(teacher => {
            const teacherObj = teacher.toObject();
            teacherObj.requestStatus = requestMap[teacher._id.toString()] || null;
            
            // Calculate credit rate based on teacher's level
            if (teacher.level >= 4 && teacher.customCreditRate > 0) {
                teacherObj.creditRate = teacher.customCreditRate;
            } else {
                const rates = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 5 };
                teacherObj.creditRate = rates[teacher.level] || 2;
            }
            
            return teacherObj;
        });
        
        const total = await User.countDocuments(query);
        
        res.status(200).json({
            success: true,
            data: teachersWithStatus,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get single teacher details
// @route   GET /api/learn/teachers/:teacherId
// @access  Private
exports.getTeacherById = async (req, res, next) => {
    try {
        const { teacherId } = req.params;
        
        const teacher = await User.findById(teacherId)
            .select('name email avatar bio rating totalReviews teachingSkills studentsCount level customCreditRate isActive createdAt')
            .populate('teachingSkills', 'name category description');
        
        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: 'Teacher not found'
            });
        }
        
        // Check if student has existing request
        const existingRequest = await SessionRequest.findOne({
            student: req.user.id,
            teacher: teacherId
        });
        
        const teacherObj = teacher.toObject();
        teacherObj.requestStatus = existingRequest ? existingRequest.status : null;
        teacherObj.existingRequestId = existingRequest ? existingRequest._id : null;
        
        // Calculate credit rate
        if (teacher.level >= 4 && teacher.customCreditRate > 0) {
            teacherObj.creditRate = teacher.customCreditRate;
        } else {
            const rates = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 5 };
            teacherObj.creditRate = rates[teacher.level] || 2;
        }
        
        res.status(200).json({
            success: true,
            data: teacherObj
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Send session request to teacher
// @route   POST /api/learn/session-request
// @access  Private
exports.createSessionRequest = async (req, res, next) => {
    try {
        const {
            teacherId,
            skillId,
            skillName,
            title,
            description,
            preferredDate,
            preferredTime,
            duration,
            proposedCredits
        } = req.body;
        
        // Validate required fields
        if (!teacherId || !title || !preferredDate || !preferredTime || !duration) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }
        
        // Check if teacher exists and is active
        const teacher = await User.findById(teacherId);
        if (!teacher || !teacher.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Teacher not found or inactive'
            });
        }
        
        // Find skill by ID or by name
        let skill = null;
        let finalSkillId = null;
        
        if (skillId) {
            // Try to find by ID first
            skill = await Skill.findById(skillId);
        } else if (skillName) {
            // Find by name (case insensitive)
            skill = await Skill.findOne({ 
                name: { $regex: new RegExp(`^${skillName.trim()}$`, 'i') } 
            });
        }
        
        if (!skill || !skill.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }
        
        finalSkillId = skill._id;
        
        // Check if teacher teaches this skill
        const hasSkill = teacher.teachingSkills && teacher.teachingSkills.includes(finalSkillId);
        if (!hasSkill) {
            return res.status(400).json({
                success: false,
                message: 'Teacher does not teach this skill'
            });
        }
        
        // Check if there's already a pending request
        const existingRequest = await SessionRequest.findOne({
            student: req.user.id,
            teacher: teacherId,
            status: { $in: ['pending', 'accepted'] }
        });
        
        if (existingRequest) {
            return res.status(400).json({
                success: false,
                message: `You already have a ${existingRequest.status} request with this teacher`,
                data: { requestId: existingRequest._id, status: existingRequest.status }
            });
        }
        
        // Create session request
        const sessionRequest = await SessionRequest.create({
            teacher: teacherId,
            student: req.user.id,
            skill: finalSkillId,
            title,
            description: description || '',
            preferredDate: new Date(preferredDate),
            preferredTime,
            duration: parseInt(duration),
            proposedCredits: parseInt(proposedCredits) || teacher.getCreditRate() * Math.ceil(duration / 60),
            status: 'pending',
            studentMessage: req.body.studentMessage || ''
        });
        
        // Populate references for response
        const populatedRequest = await SessionRequest.findById(sessionRequest._id)
            .populate('teacher', 'name email avatar rating')
            .populate('student', 'name email')
            .populate('skill', 'name category');
        
        res.status(201).json({
            success: true,
            message: 'Session request sent successfully',
            data: populatedRequest
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get student's session requests (accepted, rejected, pending)
// @route   GET /api/learn/session-requests
// @access  Private
exports.getStudentSessionRequests = async (req, res, next) => {
    try {
        const { status } = req.query;
        
        let query = { student: req.user.id };
        
        if (status && ['pending', 'accepted', 'rejected', 'cancelled'].includes(status)) {
            query.status = status;
        }
        
        const sessionRequests = await SessionRequest.find(query)
            .populate('teacher', 'name email avatar rating teachingSkills')
            .populate('skill', 'name category')
            .sort({ updatedAt: -1 });
        
        // Separate by status
        const accepted = sessionRequests.filter(req => req.status === 'accepted');
        const rejected = sessionRequests.filter(req => req.status === 'rejected');
        const pending = sessionRequests.filter(req => req.status === 'pending');
        
        // For accepted requests, check if session has been created
        const acceptedWithSession = await Promise.all(accepted.map(async (request) => {
            const session = await Session.findOne({
                teacher: request.teacher._id,
                student: req.user.id,
                skill: request.skill._id,
                status: { $in: ['confirmed', 'ongoing', 'completed'] }
            });
            
            const requestObj = request.toObject();
            requestObj.session = session || null;
            return requestObj;
        }));
        
        res.status(200).json({
            success: true,
            data: {
                accepted: acceptedWithSession,
                rejected,
                pending,
                counts: {
                    accepted: accepted.length,
                    rejected: rejected.length,
                    pending: pending.length
                }
            }
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get specific session request status
// @route   GET /api/learn/session-requests/:requestId/status
// @access  Private
exports.getSessionRequestStatus = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        
        const sessionRequest = await SessionRequest.findOne({
            _id: requestId,
            student: req.user.id
        }).populate('teacher', 'name email');
        
        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Session request not found'
            });
        }
        
        // Check if session has been created for accepted request
        let session = null;
        if (sessionRequest.status === 'accepted') {
            session = await Session.findOne({
                teacher: sessionRequest.teacher._id,
                student: req.user.id,
                skill: sessionRequest.skill
            });
        }
        
        res.status(200).json({
            success: true,
            data: {
                requestId: sessionRequest._id,
                status: sessionRequest.status,
                teacher: sessionRequest.teacher,
                skill: sessionRequest.skill,
                preferredDate: sessionRequest.preferredDate,
                preferredTime: sessionRequest.preferredTime,
                duration: sessionRequest.duration,
                proposedCredits: sessionRequest.proposedCredits,
                teacherMessage: sessionRequest.teacherMessage,
                session: session,
                createdAt: sessionRequest.createdAt,
                updatedAt: sessionRequest.updatedAt
            }
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Cancel session request (only if pending)
// @route   PUT /api/learn/session-requests/:requestId/cancel
// @access  Private
exports.cancelSessionRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        
        const sessionRequest = await SessionRequest.findOne({
            _id: requestId,
            student: req.user.id,
            status: 'pending'
        });
        
        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Pending session request not found'
            });
        }
        
        sessionRequest.status = 'cancelled';
        sessionRequest.updatedAt = Date.now();
        await sessionRequest.save();
        
        res.status(200).json({
            success: true,
            message: 'Session request cancelled successfully',
            data: sessionRequest
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Check if student can chat with a teacher
// @route   GET /api/learn/chat/check/:teacherId
// @access  Private
exports.checkChatAccess = async (req, res, next) => {
    try {
        const { teacherId } = req.params;
        
        // Check if there's an accepted session request
        const acceptedRequest = await SessionRequest.findOne({
            student: req.user.id,
            teacher: teacherId,
            status: 'accepted'
        });
        
        if (!acceptedRequest) {
            return res.status(403).json({
                success: false,
                canChat: false,
                message: 'You can only chat with teachers who have accepted your session request'
            });
        }
        
        // Check if there's an active or completed session
        const session = await Session.findOne({
            $or: [
                { teacher: teacherId, student: req.user.id },
                { teacher: teacherId, enrolledStudents: req.user.id }
            ],
            status: { $in: ['confirmed', 'ongoing', 'completed'] }
        });
        
        res.status(200).json({
            success: true,
            data: {
                canChat: true,
                requestId: acceptedRequest._id,
                sessionId: session ? session._id : null,
                message: 'You can chat with this teacher'
            }
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get or create conversation with teacher
// @route   GET /api/learn/chat/conversation/:teacherId
// @access  Private
exports.getConversation = async (req, res, next) => {
    try {
        const { teacherId } = req.params;
        
        // Verify chat access
        const acceptedRequest = await SessionRequest.findOne({
            student: req.user.id,
            teacher: teacherId,
            status: 'accepted'
        });
        
        if (!acceptedRequest) {
            return res.status(403).json({
                success: false,
                message: 'You can only chat with teachers who have accepted your session request'
            });
        }
        
        // Find or create conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user.id, teacherId] }
        }).populate('participants', 'name email avatar');
        
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [req.user.id, teacherId],
                unreadCount: new Map()
            });
            await conversation.populate('participants', 'name email avatar');
        }
        
        // Get messages for this conversation
        const messages = await Message.find({
            $or: [
                { sender: req.user.id, receiver: teacherId },
                { sender: teacherId, receiver: req.user.id }
            ]
        }).sort({ createdAt: 1 }).limit(100);
        
        // Mark messages as read
        await Message.updateMany(
            { sender: teacherId, receiver: req.user.id, isRead: false },
            { isRead: true, readAt: Date.now() }
        );
        
        res.status(200).json({
            success: true,
            data: {
                conversation,
                messages,
                sessionRequest: acceptedRequest
            }
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Send message to teacher
// @route   POST /api/learn/chat/message
// @access  Private
exports.sendMessage = async (req, res, next) => {
    try {
        const { receiverId, content, type = 'text' } = req.body;
        
        if (!receiverId || !content) {
            return res.status(400).json({
                success: false,
                message: 'Receiver ID and content are required'
            });
        }
        
        // Verify chat access
        const acceptedRequest = await SessionRequest.findOne({
            student: req.user.id,
            teacher: receiverId,
            status: 'accepted'
        });
        
        if (!acceptedRequest) {
            return res.status(403).json({
                success: false,
                message: 'You can only message teachers who have accepted your session request'
            });
        }
        
        // Create message
        const message = await Message.create({
            session: null,
            sender: req.user.id,
            receiver: receiverId,
            content,
            type,
            isFree: true,
            creditsCost: 0
        });
        
        // Update or create conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user.id, receiverId] }
        });
        
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [req.user.id, receiverId],
                lastMessage: message._id,
                lastMessageAt: Date.now(),
                unreadCount: new Map([[receiverId.toString(), 1]])
            });
        } else {
            conversation.lastMessage = message._id;
            conversation.lastMessageAt = Date.now();
            
            // Increment unread count for receiver
            const currentUnread = conversation.unreadCount.get(receiverId.toString()) || 0;
            conversation.unreadCount.set(receiverId.toString(), currentUnread + 1);
            await conversation.save();
        }
        
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name email avatar')
            .populate('receiver', 'name email avatar');
        
        // Emit socket event for real-time messaging
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${receiverId}`).emit('new_message', {
                message: populatedMessage,
                conversationId: conversation._id
            });
        }
        
        res.status(201).json({
            success: true,
            data: populatedMessage
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get student's credits balance
// @route   GET /api/learn/credits
// @access  Private
exports.getCreditsBalance = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id)
            .select('credits totalCreditsEarned totalCreditsSpent redeemableCredits level moneyEarned');
        
        res.status(200).json({
            success: true,
            data: {
                credits: user.credits,
                totalCreditsEarned: user.totalCreditsEarned,
                totalCreditsSpent: user.totalCreditsSpent,
                redeemableCredits: user.redeemableCredits,
                level: user.level,
                moneyEarned: user.moneyEarned,
                canRedeem: user.level >= 3
            }
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get available skills for filtering
// @route   GET /api/learn/skills
// @access  Private
exports.getAvailableSkills = async (req, res, next) => {
    try {
        const skills = await Skill.find({ isActive: true })
            .select('name category description popularity totalTeachers totalStudents')
            .sort({ name: 1 });
        
        res.status(200).json({
            success: true,
            data: skills
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get upcoming sessions for student
// @route   GET /api/learn/upcoming-sessions
// @access  Private
exports.getUpcomingSessions = async (req, res, next) => {
    try {
        const sessions = await Session.find({
            $or: [
                { student: req.user.id },
                { enrolledStudents: req.user.id }
            ],
            status: { $in: ['confirmed', 'ongoing'] },
            scheduledDate: { $gte: new Date() }
        })
        .populate('teacher', 'name email avatar rating')
        .populate('skill', 'name category')
        .sort({ scheduledDate: 1 });
        
        res.status(200).json({
            success: true,
            data: sessions
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get session history for student
// @route   GET /api/learn/session-history
// @access  Private
exports.getSessionHistory = async (req, res, next) => {
    try {
        const sessions = await Session.find({
            $or: [
                { student: req.user.id },
                { enrolledStudents: req.user.id }
            ],
            status: 'completed'
        })
        .populate('teacher', 'name email avatar rating')
        .populate('skill', 'name category')
        .sort({ scheduledDate: -1 })
        .limit(50);
        
        res.status(200).json({
            success: true,
            data: sessions
        });
        
    } catch (error) {
        next(error);
    }
};

// Delete Message (Student side)
exports.deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const message = await Message.findById(messageId);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }
        
        // Check if current user is the sender
        if (message.sender.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own messages'
            });
        }
        
        // Hard delete
        await Message.findByIdAndDelete(messageId);
        
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