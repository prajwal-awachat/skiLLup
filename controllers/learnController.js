const User = require('../models/User');
const Skill = require('../models/Skill');
const SessionRequest = require('../models/SessionRequest');
const Session = require('../models/Session');
const { Message, Conversation } = require('../models/Message');
const UserSkill = require('../models/UserSkill');

const {
    calculateEndTime,
    getRequestExpiryDate,
    validateProposedSlot,
    expireRequestIfNeeded,
    finalizeSessionRequest,
    isSameCalendarDay
} = require('../utils/schedulingHelper');

// @desc    Search teachers by name or skill
// @route   GET /api/learn/teachers/search
// @access  Private
exports.searchTeachers = async (req, res, next) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        const searchTerm = (q || '').trim();

        let teacherIds = [];

        if (searchTerm !== '') {
            // 1) Search matching skills
            const matchingSkills = await Skill.find({
                name: { $regex: searchTerm, $options: 'i' }
            }).select('_id');

            const skillIds = matchingSkills.map(s => s._id);

            const userSkillsBySkill = await UserSkill.find({
                type: 'teach',
                skill: { $in: skillIds }
            }).select('user');

            const teacherIdsFromSkills = userSkillsBySkill.map(us => us.user.toString());

            // 2) Search matching teacher names
            const matchingUsers = await User.find({
                name: { $regex: searchTerm, $options: 'i' },
                isActive: true
            }).select('_id');

            const teacherUserIds = matchingUsers.map(u => u._id);

            const userSkillsByName = await UserSkill.find({
                type: 'teach',
                user: { $in: teacherUserIds }
            }).select('user');

            const teacherIdsFromNames = userSkillsByName.map(us => us.user.toString());

            // 3) Merge both
            teacherIds = [...new Set([...teacherIdsFromSkills, ...teacherIdsFromNames])];
        } else {
            const userSkills = await UserSkill.find({
                type: 'teach',
                isAvailable: true
            }).select('user');

            teacherIds = [...new Set(userSkills.map(us => us.user.toString()))];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const teachers = await User.find({
            _id: { $in: teacherIds, $ne: req.user.id },
            isActive: true
        })
            .select('name email avatar bio rating totalReviews studentsCount level customCreditRate')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ rating: -1, totalReviews: -1 });

        const existingRequests = await SessionRequest.find({
            student: req.user.id,
            teacher: { $in: teachers.map(t => t._id) },
            status: { $in: ['pending', 'negotiating', 'confirmed', 'rejected'] }
        });

        const requestMap = {};
        existingRequests.forEach(r => {
            requestMap[r.teacher.toString()] = r.status;
        });

        const teachersWithStatus = await Promise.all(
            teachers.map(async (teacher) => {
                const skills = await UserSkill.find({
                    user: teacher._id,
                    type: 'teach',
                    isAvailable: true
                }).populate('skill');

                const teacherObj = teacher.toObject();
                teacherObj.teachingSkills = skills;
                teacherObj.requestStatus = requestMap[teacher._id.toString()] || null;

                teacherObj.creditRate =
                    teacher.level >= 4 && teacher.customCreditRate > 0
                        ? teacher.customCreditRate
                        : 2;

                return teacherObj;
            })
        );

        res.json({
            success: true,
            data: teachersWithStatus
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
    .select('name email avatar bio rating totalReviews studentsCount level customCreditRate isActive createdAt');

if (!teacher) {
    return res.status(404).json({
        success: false,
        message: 'Teacher not found'
    });
}

const teachingSkills = await UserSkill.find({
    user: teacherId,
    type: 'teach'
}).populate('skill');

// Check if student has existing request
const existingRequest = await SessionRequest.findOne({
    student: req.user.id,
    teacher: teacherId
});

const teacherObj = teacher.toObject();
teacherObj.teachingSkills = teachingSkills;
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
            skillName,
            title,
            description,
            preferredDate,
            preferredTime,
            duration,
            proposedCredits,
            studentMessage
        } = req.body;

        if (!teacherId || !skillName || !title || !preferredDate || !preferredTime || !duration) {
            return res.status(400).json({
                success: false,
                message: 'Teacher, skill, title, date, time and duration are required'
            });
        }

        if (teacherId === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'You cannot request a session with yourself'
            });
        }

        const teacher = await User.findById(teacherId);
        if (!teacher || !teacher.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Teacher not found or inactive'
            });
        }

        const existingActiveSession = await Session.findOne({
            teacher: teacherId,
            student: req.user.id,
            status: { $in: ['confirmed', 'ongoing'] }
        });

        if (existingActiveSession) {
            return res.status(400).json({
                success: false,
                message: 'You already have an active session with this teacher'
            });
        }

        const existingOpenRequest = await SessionRequest.findOne({
            teacher: teacherId,
            student: req.user.id,
            status: { $in: ['pending', 'negotiating', 'confirmed'] }
        });

        if (existingOpenRequest) {
            await expireRequestIfNeeded(existingOpenRequest);

            if (['pending', 'negotiating', 'confirmed'].includes(existingOpenRequest.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'You already have a request/session in progress with this teacher'
                });
            }
        }

        let skill = await Skill.findOne({
            name: { $regex: new RegExp(`^${skillName.trim()}$`, 'i') }
        });

        if (!skill) {
            skill = await Skill.create({
                name: skillName.trim(),
                category: 'Other',
                description: `Skill: ${skillName.trim()}`,
                isActive: true
            });
        }

        const teachesSkill = await UserSkill.findOne({
            user: teacherId,
            skill: skill._id,
            type: 'teach'
        });

        if (!teachesSkill) {
            return res.status(400).json({
                success: false,
                message: `Teacher does not teach "${skillName}"`
            });
        }

        const durationMinutes = 60;
        const endTime = calculateEndTime(preferredTime, durationMinutes);

        if (!endTime) {
            return res.status(400).json({
                success: false,
                message: 'This slot crosses midnight. Please choose a time that ends on the same day.'
            });
        }

        const credits = Number(proposedCredits) || teacher.getCreditRate() * Math.ceil(durationMinutes / 60);

        const validation = await validateProposedSlot({
            teacherId,
            studentId: req.user.id,
            date: preferredDate,
            startTime: preferredTime,
            endTime,
            duration: durationMinutes,
            request: null
        });

        if (!validation.ok) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const expiresAt = getRequestExpiryDate();

        const sessionRequest = await SessionRequest.create({
            teacher: teacherId,
            student: req.user.id,
            skill: skill._id,
            title: title.trim(),
            description: description || '',
            currentProposedDate: new Date(preferredDate),
            currentStartTime: preferredTime,
            currentEndTime: endTime,
            duration: durationMinutes,
            proposedCredits: credits,
            status: 'pending',
            proposedBy: req.user.id,
            lastActionBy: req.user.id,
            cycleCountForDay: 0,
            negotiationLockedForDay: false,
            allowedSuggestionMode: 'flexible',
            studentMessage: studentMessage || '',
            teacherMessage: '',
            lockExpiresAt: expiresAt,
            expiresAt,
            slotHistory: [
                {
                    proposedBy: req.user.id,
                    date: new Date(preferredDate),
                    startTime: preferredTime,
                    endTime,
                    duration: durationMinutes,
                    message: studentMessage || '',
                    isWithinAvailability: validation.withinBothAvailability
                }
            ]
        });

        const populatedRequest = await SessionRequest.findById(sessionRequest._id)
            .populate('teacher', 'name email avatar rating level')
            .populate('student', 'name email')
            .populate('skill', 'name category');

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

exports.suggestAlternateSlotByStudent = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { proposedDate, proposedStartTime, duration, message } = req.body;

        const sessionRequest = await SessionRequest.findOne({
            _id: requestId,
            student: req.user.id,
            status: { $in: ['pending', 'negotiating'] }
        });

        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Open request not found'
            });
        }

        const expiryCheck = await expireRequestIfNeeded(sessionRequest);
        if (expiryCheck.expired) {
            return res.status(400).json({
                success: false,
                message: 'This request has expired'
            });
        }

        const durationMinutes = 60;
        const proposedEndTime = calculateEndTime(proposedStartTime, durationMinutes);

        if (!proposedEndTime) {
            return res.status(400).json({
                success: false,
               message: 'This slot crosses midnight. Please choose a time that ends on the same day.'
            });
        }

       const sameDay = isSameCalendarDay(sessionRequest.currentProposedDate, proposedDate);
const nextCycleCount = sameDay ? sessionRequest.cycleCountForDay + 1 : 0;
const lockedForDay = sameDay && nextCycleCount >= 2;

const draftRequestForValidation = {
    negotiationLockedForDay: lockedForDay,
    allowedSuggestionMode: lockedForDay ? 'availability_only' : 'flexible'
};

const validation = await validateProposedSlot({
    teacherId: sessionRequest.teacher,
    studentId: sessionRequest.student,
    date: proposedDate,
    startTime: proposedStartTime,
    endTime: proposedEndTime,
    duration: durationMinutes,
    excludeRequestId: sessionRequest._id,
    request: draftRequestForValidation
});

        if (!validation.ok) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        sessionRequest.currentProposedDate = new Date(proposedDate);
        sessionRequest.currentStartTime = proposedStartTime;
        sessionRequest.currentEndTime = proposedEndTime;
        sessionRequest.duration = durationMinutes;
        sessionRequest.status = 'negotiating';
        sessionRequest.proposedBy = req.user.id;
        sessionRequest.lastActionBy = req.user.id;
        sessionRequest.studentMessage = message || '';
        sessionRequest.lockExpiresAt = sessionRequest.expiresAt;

        sessionRequest.slotHistory.push({
            proposedBy: req.user.id,
            date: new Date(proposedDate),
            startTime: proposedStartTime,
            endTime: proposedEndTime,
            duration: durationMinutes,
            message: message || '',
            isWithinAvailability: validation.withinBothAvailability
        });

         if (!sameDay) {
    sessionRequest.cycleCountForDay = 0;
    sessionRequest.negotiationLockedForDay = false;
}
sessionRequest.cycleCountForDay = nextCycleCount;
sessionRequest.negotiationLockedForDay = lockedForDay;
sessionRequest.allowedSuggestionMode = lockedForDay ? 'availability_only' : 'flexible';

        await sessionRequest.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`user_${sessionRequest.teacher}`).emit('session_request_updated', {
                requestId: sessionRequest._id,
                updatedBy: 'student'
            });
        }

        res.json({
            success: true,
            message: 'Alternate slot proposed successfully',
            data: sessionRequest
        });
    } catch (error) {
        console.error('Suggest alternate slot by student error:', error);
        next(error);
    }
};

exports.acceptNegotiatedRequestByStudent = async (req, res, next) => {
    try {
        const { requestId } = req.params;

        const sessionRequest = await SessionRequest.findOne({
            _id: requestId,
            student: req.user.id,
            status: { $in: ['pending', 'negotiating'] }
        });

        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Open request not found'
            });
        }

        const session = await finalizeSessionRequest(sessionRequest);

        const io = req.app.get('io');
        if (io) {
            io.to(`user_${sessionRequest.teacher}`).emit('session_confirmed', {
                requestId: sessionRequest._id,
                sessionId: session._id
            });
        }

        res.json({
            success: true,
            message: 'Session confirmed successfully',
            data: {
                requestId: sessionRequest._id,
                session
            }
        });
    } catch (error) {
        console.error('Student accept request error:', error);
        next(error);
    }
};

exports.rejectNegotiatedRequestByStudent = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { reason } = req.body;

        const sessionRequest = await SessionRequest.findOne({
            _id: requestId,
            student: req.user.id,
            status: { $in: ['pending', 'negotiating'] }
        });

        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Open request not found'
            });
        }

        sessionRequest.status = 'rejected';
        sessionRequest.studentMessage = reason || 'Rejected by student';
        sessionRequest.lastActionBy = req.user.id;
        sessionRequest.lockExpiresAt = null;
        await sessionRequest.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`user_${sessionRequest.teacher}`).emit('session_rejected', {
                requestId: sessionRequest._id,
                reason: sessionRequest.studentMessage
            });
        }

        res.json({
            success: true,
            message: 'Request rejected successfully'
        });
    } catch (error) {
        console.error('Student reject request error:', error);
        next(error);
    }
};
// @desc    Get student's session requests (accepted, rejected, pending)
// @route   GET /api/learn/session-requests
// @access  Private
exports.getStudentSessionRequests = async (req, res, next) => {
    try {
        const sessionRequests = await SessionRequest.find({ student: req.user.id })
            .populate('teacher', 'name email avatar rating level customCreditRate')
            .populate('skill', 'name category')
            .populate('student', 'name email')
            .populate('session')
            .sort({ updatedAt: -1 });

        for (const request of sessionRequests) {
            await expireRequestIfNeeded(request);
        }

        const refreshedRequests = await SessionRequest.find({ student: req.user.id })
            .populate('teacher', 'name email avatar rating level customCreditRate')
            .populate('skill', 'name category')
            .populate('student', 'name email')
            .populate('session')
            .sort({ updatedAt: -1 });

        const accepted = [];
        const rejected = [];
        const pending = [];
        const expired = [];

        for (const request of refreshedRequests) {
            const requestObj = request.toObject();

            if (request.status === 'confirmed') accepted.push(requestObj);
            else if (request.status === 'rejected') rejected.push(requestObj);
            else if (request.status === 'expired') expired.push(requestObj);
            else if (['pending', 'negotiating'].includes(request.status)) pending.push(requestObj);
        }

        res.status(200).json({
            success: true,
            data: {
                accepted,
                rejected,
                pending,
                expired,
                counts: {
                    accepted: accepted.length,
                    rejected: rejected.length,
                    pending: pending.length,
                    expired: expired.length
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
        })
            .populate('teacher', 'name email avatar')
            .populate('skill', 'name category')
            .populate('session');

        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Session request not found'
            });
        }

        await expireRequestIfNeeded(sessionRequest);

        const refreshedRequest = await SessionRequest.findById(requestId)
            .populate('teacher', 'name email avatar')
            .populate('skill', 'name category')
            .populate('session');

        res.status(200).json({
            success: true,
            data: refreshedRequest
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
            status: { $in: ['pending', 'negotiating'] }
        });

        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Open session request not found'
            });
        }

        sessionRequest.status = 'cancelled';
        sessionRequest.lastActionBy = req.user.id;
        sessionRequest.lockExpiresAt = null;
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
    status: { $in: ['confirmed'] }
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
                    : 'Chat is available only after request confirmation and before session completion'
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
    status: { $in: ['confirmed'] }
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
                message: 'Chat is available only after request confirmation and before session completion'
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
    status: { $in: ['confirmed'] }
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
        message: 'Chat is available only after request confirmation and before session completion'
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
            .select('name category description popularity totalTeachers totalLearners')
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
            status: { $in: ['confirmed', 'ongoing'] }
        })
            .populate('teacher', 'name email avatar rating')
            .populate('skill', 'name category')
            .sort({ scheduledStart: 1 });

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