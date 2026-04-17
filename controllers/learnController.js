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
            isActive: true,
            _id: { $ne: req.user.id }
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
    teacher: { $in: teachers.map(t => t._id) },
    status: { $in: ['pending', 'accepted'] }
}).select('teacher status updatedAt').sort({ updatedAt: -1 });
        
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
// @desc    Send session request to teacher
// @route   POST /api/learn/session-request
// @access  Private
exports.createSessionRequest = async (req, res, next) => {
    try {
        const {
            teacherId,
            skillName,      // This comes from frontend as string
            title,
            description,
            preferredDate,
            preferredTime,
            duration,
            proposedCredits
        } = req.body;

          if (!teacherId || teacherId === 'undefined') {
            return res.status(400).json({
                success: false,
                message: 'Invalid teacher ID. Please refresh the page and try again.'
            });
        }
        
        console.log('Received session request:', { teacherId, skillName, title, preferredDate, preferredTime });
        
        // Validate required fields
        if (!teacherId || !skillName || !title || !preferredDate || !preferredTime) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: teacher, skill name, title, date, time'
            });
        }

        // Check if user is trying to request self
        if (teacherId === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'You cannot request a session with yourself'
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
        
        // CHECK FOR EXISTING ACTIVE SESSION
        const existingActiveSession = await Session.findOne({
            teacher: teacherId,
            student: req.user.id,
            status: { $in: ['confirmed', 'ongoing'] }
        });
        
        if (existingActiveSession) {
            return res.status(400).json({
                success: false,
                message: 'You already have an active session with this teacher. Complete it before requesting another.'
            });
        }
        
        // FIND OR CREATE SKILL BY NAME
        let skill = await Skill.findOne({ 
            name: { $regex: new RegExp(`^${skillName.trim()}$`, 'i') } 
        });
        
        // If skill doesn't exist, create it
        if (!skill) {
            skill = await Skill.create({
                name: skillName.trim(),
                category: 'General',
                description: `Skill: ${skillName.trim()}`,
                isActive: true
            });
            console.log(`Created new skill: ${skill.name}`);
        }
        
        // Check if teacher teaches this skill
        const hasSkill = teacher.teachingSkills && teacher.teachingSkills.includes(skill._id);
        if (!hasSkill) {
            return res.status(400).json({
                success: false,
                message: `Teacher does not teach "${skillName}". Please check their teaching skills.`
            });
        }
        
       const existingRequest = await SessionRequest.findOne({
        student: req.user.id,
         teacher: teacherId,
        status: { $in: ['pending', 'accepted'] }
         });

           if (existingRequest) {
            return res.status(400).json({
               success: false,
             message: 'You already have a request/session in progress with this teacher. Finish that cycle before sending a new request.'
               });
            }
        
        // Calculate credits (2 credits per hour by default)
        const durationMinutes = parseInt(duration) || 60;
        const calculatedCredits = proposedCredits || (teacher.getCreditRate ? teacher.getCreditRate() : 2) * Math.ceil(durationMinutes / 60);
        
        // Create session request with skill ObjectId
        const sessionRequest = await SessionRequest.create({
            teacher: teacherId,
            student: req.user.id,
            skill: skill._id,  // IMPORTANT: Store ObjectId, not string
            title: title.trim(),
            description: description || '',
            preferredDate: new Date(preferredDate),
            preferredTime,
            duration: durationMinutes,
            proposedCredits: calculatedCredits,
            status: 'pending',
            studentMessage: req.body.studentMessage || ''
        });
        
        // Populate references for response
        const populatedRequest = await SessionRequest.findById(sessionRequest._id)
            .populate('teacher', 'name email avatar rating level')
            .populate('student', 'name email')
            .populate('skill', 'name category');
        
        console.log(`Session request created: ${populatedRequest._id}`);
        
        res.status(201).json({
            success: true,
            message: 'Session request sent successfully',
            data: populatedRequest
        });
        
    } catch (error) {
        console.error('Create session request error:', error);
        next(error);
    }
};
// @desc    Get student's session requests (accepted, rejected, pending)
// @route   GET /api/learn/session-requests
// @access  Private
exports.getStudentSessionRequests = async (req, res, next) => {
    try {
        const query = { student: req.user.id };
        
        const sessionRequests = await SessionRequest.find(query)
            .populate('teacher', 'name email avatar rating level customCreditRate teachingSkills')
            .populate('skill', 'name category')
            .populate('student', 'name email')
            .sort({ updatedAt: -1 });
        
        // Separate by status
        const accepted = [];
        const rejected = [];
        const pending = [];
        
        for (const request of sessionRequests) {
            const requestObj = request.toObject();
            
            // For accepted requests, try to find the associated session
            if (request.status === 'accepted') {
                let session = null;

             if (request.session) {
                 session = await Session.findById(request.session)
              .populate('teacher', 'name email');
               }

requestObj.session = session || null;
                accepted.push(requestObj);
            } 
            else if (request.status === 'rejected') {
                rejected.push(requestObj);
            } 
            else if (request.status === 'pending') {
                pending.push(requestObj);
            }
        }
        
        res.status(200).json({
            success: true,
            data: {
                accepted,
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
        console.error('Get student session requests error:', error);
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
       if (sessionRequest.status === 'accepted' && sessionRequest.session) {
          session = await Session.findById(sessionRequest.session);
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

        if (!teacherId || teacherId === 'undefined') {
            return res.status(400).json({
                success: false,
                data: {
                    canChat: false,
                    message: 'Invalid teacher ID'
                }
            });
        }

        const acceptedRequest = await SessionRequest.findOne({
            student: req.user.id,
            teacher: teacherId,
            status: 'accepted'
        });

        const activeSession = await Session.findOne({
            $or: [
                { teacher: teacherId, student: req.user.id },
                { teacher: teacherId, enrolledStudents: req.user.id }
            ],
            status: { $in: ['confirmed', 'ongoing'] }
        });

        const canChat = !!(acceptedRequest || activeSession);

        return res.status(200).json({
            success: true,
            data: {
                canChat,
                requestId: acceptedRequest ? acceptedRequest._id : null,
                sessionId: activeSession ? activeSession._id : null,
                message: canChat
                    ? 'You can chat with this teacher'
                    : 'Chat is available only after acceptance and before session completion'
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

        const acceptedRequest = await SessionRequest.findOne({
            student: req.user.id,
            teacher: teacherId,
            status: 'accepted'
        });

        const activeSession = await Session.findOne({
            $or: [
                { teacher: teacherId, student: req.user.id },
                { teacher: teacherId, enrolledStudents: req.user.id }
            ],
            status: { $in: ['confirmed', 'ongoing'] }
        });

        if (!acceptedRequest && !activeSession) {
            return res.status(403).json({
                success: false,
                message: 'Chat is available only after acceptance and before session completion'
            });
        }

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

        const messages = await Message.find({
            $or: [
                { sender: req.user.id, receiver: teacherId },
                { sender: teacherId, receiver: req.user.id }
            ]
        })
            .populate('sender', 'name email avatar')
            .populate('receiver', 'name email avatar')
            .sort({ createdAt: 1 })
            .limit(100);

        await Message.updateMany(
            { sender: teacherId, receiver: req.user.id, isRead: false },
            { isRead: true, readAt: Date.now() }
        );

        res.status(200).json({
            success: true,
            data: {
                conversation,
                messages,
                sessionRequest: acceptedRequest,
                session: activeSession
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

const activeSession = await Session.findOne({
    $or: [
        { teacher: receiverId, student: req.user.id },
        { teacher: receiverId, enrolledStudents: req.user.id }
    ],
    status: { $in: ['confirmed', 'ongoing'] }
});

if (!acceptedRequest && !activeSession) {
    return res.status(403).json({
        success: false,
        message: 'Chat is available only after acceptance and before session completion'
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

// @desc    Delete rejected session request (soft delete or permanent)
// @route   DELETE /api/learn/session-requests/:requestId/delete
// @access  Private
exports.deleteRejectedRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        
        const sessionRequest = await SessionRequest.findOne({
            _id: requestId,
            student: req.user.id,
            status: 'rejected'
        });
        
        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Rejected session request not found'
            });
        }
        
        // Hard delete the rejected request
        await SessionRequest.findByIdAndDelete(requestId);
        
        res.status(200).json({
            success: true,
            message: 'Rejected request removed successfully'
        });
        
    } catch (error) {
        next(error);
    }
};