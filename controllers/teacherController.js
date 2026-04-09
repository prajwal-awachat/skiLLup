const User = require('../models/User');
const UserSkill = require('../models/UserSkill');
const Skill = require('../models/Skill');
const SessionRequest = require('../models/SessionRequest');
const Session = require('../models/Session');
const Transaction = require('../models/Transaction');
const { Message, Conversation } = require('../models/Message');

// ==================== SKILL MANAGEMENT ====================

exports.getTeacherSkills = async (req, res) => {
    try {
        const userSkills = await UserSkill.find({
            user: req.user._id,
            isTeaching: true
        }).populate('skill');
        
        res.json({
            success: true,
            data: userSkills
        });
    } catch (error) {
        console.error('Get teacher skills error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch skills'
        });
    }
};

exports.addTeacherSkill = async (req, res) => {
    try {
        const { skillName, proficiencyLevel, yearsOfExperience, hourlyRate } = req.body;
        
        // Check if skill name is provided
        if (!skillName || skillName.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Skill name is required'
            });
        }
        
        // Find or create skill (case insensitive)
        let skill = await Skill.findOne({ 
            name: { $regex: new RegExp(`^${skillName.trim()}$`, 'i') } 
        });
        
        if (!skill) {
            // Create new skill if doesn't exist
            skill = await Skill.create({
                name: skillName.trim(),
                category: 'Other',
                description: `Teaching ${skillName}`,
                isActive: true,
                totalTeachers: 0,
                totalStudents: 0,
                popularity: 0
            });
        }
        
        const skillId = skill._id;
        
        // Check if already teaching this skill
        const existingSkill = await UserSkill.findOne({
            user: req.user._id,
            skill: skillId,
            isTeaching: true
        });
        
        if (existingSkill) {
            return res.status(400).json({
                success: false,
                message: 'You are already teaching this skill'
            });
        }
        
        // Create user skill
        const userSkill = await UserSkill.create({
            user: req.user._id,
            skill: skillId,
            proficiencyLevel: proficiencyLevel || 'intermediate',
            yearsOfExperience: yearsOfExperience || 0,
            hourlyRate: hourlyRate || req.user.getCreditRate(),
            isTeaching: true,
            isAvailable: true
        });
        
        // Add to user's teachingSkills array (with safety check)
        if (req.user.teachingSkills) {
            if (!req.user.teachingSkills.includes(skillId)) {
                req.user.teachingSkills.push(skillId);
                await req.user.save();
            }
        } else {
            req.user.teachingSkills = [skillId];
            await req.user.save();
        }
        
        // Update skill total teachers count
        skill.totalTeachers = (skill.totalTeachers || 0) + 1;
        await skill.save();
        
        const populatedSkill = await UserSkill.findById(userSkill._id).populate('skill');
        
        res.json({
            success: true,
            data: populatedSkill,
            message: 'Skill added successfully'
        });
    } catch (error) {
        console.error('Add teacher skill error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add skill: ' + error.message
        });
    }
};

exports.updateTeacherSkill = async (req, res) => {
    try {
        const { skillId } = req.params;
        const { proficiencyLevel, yearsOfExperience, hourlyRate, isAvailable } = req.body;
        
        const userSkill = await UserSkill.findOne({
            user: req.user._id,
            skill: skillId,
            isTeaching: true
        });
        
        if (!userSkill) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }
        
        // Check level restrictions for hourly rate
        if (hourlyRate && req.user.level < 4) {
            return res.status(403).json({
                success: false,
                message: 'Only level 4+ teachers can set custom rates'
            });
        }
        
        if (proficiencyLevel) userSkill.proficiencyLevel = proficiencyLevel;
        if (yearsOfExperience !== undefined) userSkill.yearsOfExperience = yearsOfExperience;
        if (hourlyRate && req.user.level >= 4) userSkill.hourlyRate = hourlyRate;
        if (isAvailable !== undefined) userSkill.isAvailable = isAvailable;
        
        await userSkill.save();
        
        const updatedSkill = await UserSkill.findById(userSkill._id).populate('skill');
        
        res.json({
            success: true,
            data: updatedSkill,
            message: 'Skill updated successfully'
        });
    } catch (error) {
        console.error('Update teacher skill error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update skill'
        });
    }
};

exports.removeTeacherSkill = async (req, res) => {
    try {
        const { skillId } = req.params;
        
        const userSkill = await UserSkill.findOneAndDelete({
            user: req.user._id,
            skill: skillId,
            isTeaching: true
        });
        
        if (!userSkill) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }
        
        // Remove from user's teachingSkills array
        req.user.teachingSkills = req.user.teachingSkills.filter(
            id => id.toString() !== skillId
        );
        await req.user.save();
        
        // Update skill total teachers count
        await Skill.findByIdAndUpdate(skillId, {
            $inc: { totalTeachers: -1 }
        });
        
        res.json({
            success: true,
            message: 'Skill removed successfully'
        });
    } catch (error) {
        console.error('Remove teacher skill error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove skill'
        });
    }
};

// ==================== PROFILE MANAGEMENT ====================

exports.getTeacherProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password')
            .populate('teachingSkills');
        
        const teachingSkills = await UserSkill.find({
            user: req.user._id,
            isTeaching: true
        }).populate('skill');
        
        res.json({
            success: true,
            data: {
                user,
                teachingSkills,
                level: user.level,
                creditRate: user.getCreditRate(),
                canRedeem: user.canRedeemCredits(),
                canHaveGroupSessions: user.canHaveGroupSessions()
            }
        });
    } catch (error) {
        console.error('Get teacher profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
};

exports.updateTeacherProfile = async (req, res) => {
    try {
        const { bio, name, avatar, customCreditRate } = req.body;
        
        if (bio) req.user.bio = bio;
        if (name) req.user.name = name;
        if (avatar) req.user.avatar = avatar;
        
        // Update credit rate for level 4+
        if (customCreditRate && req.user.level >= 4) {
            req.user.customCreditRate = customCreditRate;
        }
        
        await req.user.save();
        
        res.json({
            success: true,
            data: req.user,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Update teacher profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
};

// ==================== TRENDING TOPICS ====================

exports.getTrendingTopics = async (req, res) => {
    try {
        // Get skills with most teachers and sessions
        const trendingSkills = await Skill.find({ isActive: true })
            .sort({ popularity: -1, totalTeachers: -1 })
            .limit(10);
        
        // Get session request trends
        const topRequestedSkills = await SessionRequest.aggregate([
            { $match: { status: 'pending' } },
            { $group: { _id: '$skill', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);
        
        const topSkills = await Skill.populate(topRequestedSkills, { path: '_id' });
        
        res.json({
            success: true,
            data: {
                trendingSkills,
                highDemandSkills: topSkills.map(t => ({
                    skill: t._id,
                    requestCount: t.count
                }))
            }
        });
    } catch (error) {
        console.error('Get trending topics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch trending topics'
        });
    }
};

// ==================== SESSION REQUESTS ====================

exports.getIncomingRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const query = { teacher: req.user._id };
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const requests = await SessionRequest.find(query)
            .populate('student', 'name email avatar rating')
            .populate('skill', 'name category')
            .sort({ createdAt: -1 });
        
        const counts = {
            pending: await SessionRequest.countDocuments({ teacher: req.user._id, status: 'pending' }),
            accepted: await SessionRequest.countDocuments({ teacher: req.user._id, status: 'accepted' }),
            rejected: await SessionRequest.countDocuments({ teacher: req.user._id, status: 'rejected' }),
            total: requests.length
        };
        
        res.json({
            success: true,
            data: {
                requests,
                counts
            }
        });
    } catch (error) {
        console.error('Get incoming requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch requests'
        });
    }
};

exports.acceptSessionRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { scheduledDate, scheduledTime } = req.body; // Remove meetingLink
        
        const sessionRequest = await SessionRequest.findById(requestId);
        
        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }
        
        if (sessionRequest.teacher.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }
        
        if (sessionRequest.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Request already processed'
            });
        }
        
        // Get credit rate based on teacher level
        let creditsPerSession = sessionRequest.proposedCredits;
        
        if (req.user.level === 1) {
            creditsPerSession = 1;
        } else if (req.user.level === 2 || req.user.level === 3) {
            creditsPerSession = req.user.getCreditRate();
        } else if (req.user.level >= 4) {
            creditsPerSession = req.user.customCreditRate || creditsPerSession;
        }
        
        // Check if student has enough credits
        const student = await User.findById(sessionRequest.student);
        if (student.credits < creditsPerSession) {
            return res.status(400).json({
                success: false,
                message: 'Student does not have enough credits'
            });
        }
        
        // Use provided date/time or fall back to student's preferred values
        const finalDate = scheduledDate || sessionRequest.preferredDate;
        const finalTime = scheduledTime || sessionRequest.preferredTime;
        
        // Create session (without meetingLink - it will be generated when session starts)
        const session = await Session.create({
            teacher: req.user._id,
            student: sessionRequest.student,
            skill: sessionRequest.skill,
            title: sessionRequest.title,
            description: sessionRequest.description,
            creditsPerSession: creditsPerSession,
            duration: sessionRequest.duration,
            scheduledDate: finalDate,
            scheduledTime: finalTime,
            meetingLink: '', // Empty for now, will be generated when starting session
            sessionType: req.user.level >= 5 && sessionRequest.sessionType === 'group' ? 'group' : 'one-on-one',
            maxStudents: req.user.level >= 5 ? 5 : 1,
            status: 'confirmed'
        });
        
        // Deduct credits from student
        await student.deductCredits(creditsPerSession, session._id);
        
        // Update session request
        sessionRequest.status = 'accepted';
        sessionRequest.teacherMessage = 'Session accepted';
        await sessionRequest.save();
        
        // Create conversation for chat
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user._id, sessionRequest.student] }
        });
        
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [req.user._id, sessionRequest.student],
                lastMessageAt: new Date()
            });
        }
        
        // Notify via socket
        const io = req.app.get('io');
        io.to(`user_${sessionRequest.student}`).emit('session_accepted', {
            sessionId: session._id,
            requestId: sessionRequest._id,
            teacherName: req.user.name,
            scheduledDate: session.scheduledDate,
            scheduledTime: session.scheduledTime
        });
        
        res.json({
            success: true,
            data: {
                session,
                conversationId: conversation._id
            },
            message: 'Session accepted successfully'
        });
    } catch (error) {
        console.error('Accept session request error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to accept request'
        });
    }
};

exports.rejectSessionRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { reason } = req.body;
        
        const sessionRequest = await SessionRequest.findById(requestId);
        
        if (!sessionRequest) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }
        
        if (sessionRequest.teacher.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }
        
        if (sessionRequest.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Request already processed'
            });
        }
        
        sessionRequest.status = 'rejected';
        sessionRequest.teacherMessage = reason || 'Request rejected';
        await sessionRequest.save();
        
        // Notify student via socket
        const io = req.app.get('io');
        io.to(`user_${sessionRequest.student}`).emit('session_rejected', {
            requestId: sessionRequest._id,
            teacherName: req.user.name,
            reason: sessionRequest.teacherMessage
        });
        
        res.json({
            success: true,
            message: 'Request rejected'
        });
    } catch (error) {
        console.error('Reject session request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject request'
        });
    }
};

// ==================== SESSION MANAGEMENT ====================

exports.getUpcomingSessions = async (req, res) => {
    try {
        const now = new Date();
        
        const sessions = await Session.find({
            teacher: req.user._id,
            scheduledDate: { $gte: now },
            status: { $in: ['confirmed', 'ongoing'] }
        })
            .populate('student', 'name email avatar')
            .populate('skill', 'name')
            .sort({ scheduledDate: 1, scheduledTime: 1 });
        
        res.json({
            success: true,
            data: sessions
        });
    } catch (error) {
        console.error('Get upcoming sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sessions'
        });
    }
};

exports.getCompletedSessions = async (req, res) => {
    try {
        const sessions = await Session.find({
            teacher: req.user._id,
            status: 'completed'
        })
            .populate('student', 'name email avatar')
            .populate('skill', 'name')
            .sort({ scheduledDate: -1 })
            .limit(50);
        
        // Calculate earnings
        const totalEarned = sessions.reduce((sum, session) => sum + session.creditsPerSession, 0);
        
        res.json({
            success: true,
            data: {
                sessions,
                totalEarned,
                totalSessions: sessions.length
            }
        });
    } catch (error) {
        console.error('Get completed sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sessions'
        });
    }
};

exports.startSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await Session.findById(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        if (session.teacher.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }
        
        // Generate meeting link if not exists
        let meetingLink = session.meetingLink;
        if (!meetingLink) {
            const roomId = `room_${session._id}_${Date.now()}`;
            meetingLink = `/meeting/${roomId}`;
            session.meetingLink = meetingLink;
        }
        
        session.status = 'ongoing';
        await session.save();
        
        // Notify student
        const io = req.app.get('io');
        io.to(`user_${session.student}`).emit('session_started', {
            sessionId: session._id,
            meetingLink: meetingLink,
            joinCode: session.joinCode
        });
        
        res.json({
            success: true,
            data: {
                meetingLink: meetingLink,
                joinCode: session.joinCode,
                roomId: session.roomId
            },
            message: 'Session started'
        });
    } catch (error) {
        console.error('Start session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start session'
        });
    }
};

exports.getSessionDetails = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await Session.findById(sessionId)
            .populate('teacher', 'name email avatar rating')
            .populate('student', 'name email avatar rating')
            .populate('skill', 'name category')
            .populate('enrolledStudents', 'name email avatar');
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        if (session.teacher.toString() !== req.user._id.toString() && 
            session.student.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }
        
        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        console.error('Get session details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch session'
        });
    }
};

exports.completeSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { notes, summary } = req.body;
        
        const session = await Session.findById(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        if (session.teacher.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }
        
        session.status = 'completed';
        session.isCompleted = true;
        if (notes) session.notes = notes;
        session.updatedAt = new Date();
        await session.save();
        
        // Add earnings to teacher
        await req.user.addEarnings(session.creditsPerSession, session._id);
        
        // Notify student
        const io = req.app.get('io');
        io.to(`user_${session.student}`).emit('session_completed', {
            sessionId: session._id,
            teacherName: req.user.name
        });
        
        res.json({
            success: true,
            message: 'Session marked as completed'
        });
    } catch (error) {
        console.error('Complete session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete session'
        });
    }
};

// ==================== CHAT ACCESS CHECK ====================

exports.canChatWithStudent = async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // FIX: Prevent chatting with yourself
        if (req.user._id.toString() === studentId) {
            return res.status(403).json({
                success: false,
                data: {
                    canChat: false,
                    message: 'You cannot chat with yourself'
                }
            });
        }
        
        // Check if there's an accepted session or session request
        const acceptedRequest = await SessionRequest.findOne({
            teacher: req.user._id,
            student: studentId,
            status: 'accepted'
        });
        
        const activeSession = await Session.findOne({
            teacher: req.user._id,
            student: studentId,
            status: { $in: ['confirmed', 'ongoing'] }
        });
        
        // Also check if there's a completed session (for history/feedback)
        const completedSession = await Session.findOne({
            teacher: req.user._id,
            student: studentId,
            status: 'completed'
        });
        
        const canChat = !!(acceptedRequest || activeSession || completedSession);
        
        let message = 'No active session found';
        if (acceptedRequest) message = 'Chat access granted (accepted request)';
        else if (activeSession) message = 'Chat access granted (active session)';
        else if (completedSession) message = 'Chat access granted (completed session)';
        
        res.json({
            success: true,
            data: {
                canChat,
                message: canChat ? message : 'You can only chat with students you have an accepted or completed session with'
            }
        });
    } catch (error) {
        console.error('Chat access check error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check chat access'
        });
    }
};

// ==================== TEACHER CHAT FUNCTIONS ====================

// Check if teacher can chat with student
exports.teacherCanChatWithStudent = async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Prevent chatting with yourself
        if (req.user._id.toString() === studentId) {
            return res.status(403).json({
                success: false,
                data: {
                    canChat: false,
                    message: 'You cannot chat with yourself'
                }
            });
        }
        
        // Check if there's an accepted session or session request
        const acceptedRequest = await SessionRequest.findOne({
            teacher: req.user._id,
            student: studentId,
            status: 'accepted'
        });
        
        const activeSession = await Session.findOne({
            teacher: req.user._id,
            student: studentId,
            status: { $in: ['confirmed', 'ongoing'] }
        });
        
        const completedSession = await Session.findOne({
            teacher: req.user._id,
            student: studentId,
            status: 'completed'
        });
        
        const canChat = !!(acceptedRequest || activeSession || completedSession);
        
        let message = 'No active session found';
        if (acceptedRequest) message = 'Chat access granted (accepted request)';
        else if (activeSession) message = 'Chat access granted (active session)';
        else if (completedSession) message = 'Chat access granted (completed session)';
        
        res.json({
            success: true,
            data: {
                canChat,
                message: canChat ? message : 'You can only chat with students you have an accepted or completed session with'
            }
        });
    } catch (error) {
        console.error('Teacher chat access check error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check chat access'
        });
    }
};

// Get or create conversation for teacher
exports.teacherGetConversation = async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Prevent chatting with yourself
        if (req.user._id.toString() === studentId) {
            return res.status(403).json({
                success: false,
                message: 'You cannot chat with yourself'
            });
        }
        
        // Verify chat access
        const acceptedRequest = await SessionRequest.findOne({
            teacher: req.user._id,
            student: studentId,
            status: 'accepted'
        });
        
        const activeSession = await Session.findOne({
            teacher: req.user._id,
            student: studentId,
            status: { $in: ['confirmed', 'ongoing'] }
        });
        
        const completedSession = await Session.findOne({
            teacher: req.user._id,
            student: studentId,
            status: 'completed'
        });
        
        if (!acceptedRequest && !activeSession && !completedSession) {
            return res.status(403).json({
                success: false,
                message: 'You can only chat with students you have an accepted or completed session with'
            });
        }
        
        // Find or create conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user._id, studentId] }
        }).populate('participants', 'name email avatar');
        
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [req.user._id, studentId],
                lastMessageAt: new Date()
            });
            await conversation.populate('participants', 'name email avatar');
        }
        
        // Get messages for this conversation
        const messages = await Message.find({
            $or: [
                { sender: req.user._id, receiver: studentId },
                { sender: studentId, receiver: req.user._id }
            ]
        }).sort({ createdAt: 1 }).limit(100);
        
        // Mark messages as read
        await Message.updateMany(
            { sender: studentId, receiver: req.user._id, isRead: false },
            { isRead: true, readAt: Date.now() }
        );
        
        res.json({
            success: true,
            data: {
                conversation,
                messages,
                sessionRequest: acceptedRequest
            }
        });
    } catch (error) {
        console.error('Teacher get conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load conversation'
        });
    }
};

// Send message as teacher
exports.teacherSendMessage = async (req, res) => {
    try {
        const { receiverId, content, type = 'text' } = req.body;
        
        if (!receiverId || !content) {
            return res.status(400).json({
                success: false,
                message: 'Receiver ID and content are required'
            });
        }
        
        // Prevent messaging yourself
        if (req.user._id.toString() === receiverId) {
            return res.status(403).json({
                success: false,
                message: 'You cannot message yourself'
            });
        }
        
        // Verify chat access
        const acceptedRequest = await SessionRequest.findOne({
            teacher: req.user._id,
            student: receiverId,
            status: 'accepted'
        });
        
        const activeSession = await Session.findOne({
            teacher: req.user._id,
            student: receiverId,
            status: { $in: ['confirmed', 'ongoing'] }
        });
        
        const completedSession = await Session.findOne({
            teacher: req.user._id,
            student: receiverId,
            status: 'completed'
        });
        
        if (!acceptedRequest && !activeSession && !completedSession) {
            return res.status(403).json({
                success: false,
                message: 'You can only message students you have an accepted or completed session with'
            });
        }
        
        // Create message
        const message = await Message.create({
            session: null,
            sender: req.user._id,
            receiver: receiverId,
            content,
            type,
            isFree: true,
            creditsCost: 0
        });
        
        // Update or create conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [req.user._id, receiverId] }
        });
        
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [req.user._id, receiverId],
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
        
        // Emit socket event
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
        console.error('Teacher send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
};

// ==================== CREDITS & EARNINGS ====================

exports.getCreditsAndEarnings = async (req, res) => {
    try {
        // Get completed sessions earnings
        const completedSessions = await Session.find({
            teacher: req.user._id,
            status: 'completed'
        });
        
        const totalCreditsEarned = completedSessions.reduce(
            (sum, session) => sum + session.creditsPerSession, 0
        );
        
        // Get transaction history
        const transactions = await Transaction.find({
            user: req.user._id
        }).sort({ createdAt: -1 }).limit(20);
        
        res.json({
            success: true,
            data: {
                credits: req.user.credits,
                totalCreditsEarned: req.user.totalCreditsEarned,
                redeemableCredits: req.user.redeemableCredits,
                moneyEarned: req.user.moneyEarned,
                creditRate: req.user.getCreditRate(),
                level: req.user.level,
                canRedeem: req.user.canRedeemCredits(),
                transactions
            }
        });
    } catch (error) {
        console.error('Get credits and earnings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch earnings'
        });
    }
};

// ==================== WITHDRAW SYSTEM ====================

exports.requestWithdrawal = async (req, res) => {
    try {
        const { amount, paymentMethod, paymentDetails } = req.body;
        
        // Check if user can withdraw
        if (!req.user.canRedeemCredits()) {
            return res.status(403).json({
                success: false,
                message: 'Withdrawal not available for your level'
            });
        }
        
        if (req.user.level === 1 || req.user.level === 2) {
            return res.status(403).json({
                success: false,
                message: 'Withdrawal not available for your level'
            });
        }
        
        if (req.user.redeemableCredits < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient redeemable credits'
            });
        }
        
        // Calculate money value (1 credit = ₹10)
        const moneyValue = amount * 10;
        
        // Create withdrawal request record (you might want a separate Withdrawal model)
        const withdrawalRequest = {
            user: req.user._id,
            amount: amount,
            moneyValue: moneyValue,
            paymentMethod: paymentMethod,
            paymentDetails: paymentDetails,
            status: 'pending',
            createdAt: new Date()
        };
        
        // Store in database (assuming you have a Withdrawal model)
        // For now, just redeem the credits
        await req.user.redeemCredits(amount);
        
        // Here you would integrate with payment gateway or store withdrawal request
        
        res.json({
            success: true,
            data: {
                amount: amount,
                moneyValue: moneyValue,
                remainingCredits: req.user.credits,
                remainingRedeemable: req.user.redeemableCredits
            },
            message: `Withdrawal request for ₹${moneyValue} submitted successfully`
        });
    } catch (error) {
        console.error('Request withdrawal error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process withdrawal'
        });
    }
};

// ==================== LEVEL FEATURES ====================

exports.getLevelFeatures = async (req, res) => {
    try {
        const level = req.user.level;
        
        const features = {
            level: level,
            creditRate: req.user.getCreditRate(),
            canSetOwnRate: level >= 4,
            canWithdraw: level >= 3,
            canHaveGroupSessions: level >= 5,
            canHaveGroupChat: level >= 5,
            pricingControl: level >= 4,
            features: {
                level1: {
                    creditsPerSession: 1,
                    canWithdraw: false,
                    canSetRate: false,
                    groupSessions: false
                },
                level2: {
                    creditsPerSession: 'Admin set',
                    canWithdraw: false,
                    canSetRate: false,
                    groupSessions: false
                },
                level3: {
                    creditsPerSession: 'Admin set',
                    canWithdraw: true,
                    canSetRate: false,
                    groupSessions: false
                },
                level4: {
                    creditsPerSession: 'Teacher set',
                    canWithdraw: true,
                    canSetRate: true,
                    groupSessions: false,
                    oneOnOneOnly: true
                },
                level5: {
                    creditsPerSession: 'Teacher set per student',
                    canWithdraw: true,
                    canSetRate: true,
                    groupSessions: true,
                    groupChat: true
                }
            }
        };
        
        res.json({
            success: true,
            data: features
        });
    } catch (error) {
        console.error('Get level features error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch level features'
        });
    }
};

exports.updateCreditRate = async (req, res) => {
    try {
        const { creditRate } = req.body;
        
        if (req.user.level < 4) {
            return res.status(403).json({
                success: false,
                message: 'Only level 4+ teachers can set custom rates'
            });
        }
        
        if (!creditRate || creditRate < 1) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credit rate'
            });
        }
        
        req.user.customCreditRate = creditRate;
        await req.user.save();
        
        // Update all teaching skills hourly rate
        await UserSkill.updateMany(
            { user: req.user._id, isTeaching: true },
            { hourlyRate: creditRate }
        );
        
        res.json({
            success: true,
            data: {
                creditRate: creditRate,
                level: req.user.level
            },
            message: 'Credit rate updated successfully'
        });
    } catch (error) {
        console.error('Update credit rate error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update credit rate'
        });
    }
};

// Delete Message (Teacher side)
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
        if (message.sender.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own messages'
            });
        }
        
        // Soft delete or hard delete - let's do hard delete
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