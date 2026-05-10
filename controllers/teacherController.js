const User = require('../models/User');
const UserSkill = require('../models/UserSkill');
const Skill = require('../models/Skill');
const SessionRequest = require('../models/SessionRequest');
const Session = require('../models/Session');
const Transaction = require('../models/Transaction');
const SessionSummary = require('../models/SessionSummary');
const { Message, Conversation } = require('../models/Message');
const {
    calculateEndTime,
    validateProposedSlot,
    expireRequestIfNeeded,
    finalizeSessionRequest,
    isSameCalendarDay
} = require('../utils/schedulingHelper');

const {
    completeSessionInternal
} = require('../utils/sessionCompletionHelper');

// ==================== SKILL MANAGEMENT ====================

exports.getTeacherSkills = async (req, res) => {
    try {
        const userSkills = await UserSkill.find({
            user: req.user._id,
            type: 'teach'
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

        if (!skillName || skillName.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Skill name is required'
            });
        }

        let skill = await Skill.findOne({
            name: { $regex: new RegExp(`^${skillName.trim()}$`, 'i') }
        });

        if (!skill) {
            skill = await Skill.create({
                name: skillName.trim(),
                category: 'Other',
                description: `Teaching ${skillName.trim()}`,
                isActive: true,
                totalTeachers: 0,
                totalLearners: 0,
                popularity: 0
            });
        }

        const existingSkill = await UserSkill.findOne({
            user: req.user._id,
            skill: skill._id,
            type: 'teach'
        });

        if (existingSkill) {
            return res.status(400).json({
                success: false,
                message: 'You are already teaching this skill'
            });
        }

        const userSkill = await UserSkill.create({
            user: req.user._id,
            skill: skill._id,
            type: 'teach',
            proficiencyLevel: proficiencyLevel || 'intermediate',
            yearsOfExperience: yearsOfExperience || 0,
            hourlyRate: hourlyRate || await req.user.getCreditRate(),
            isAvailable: true
        });

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
    type: 'teach'
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
            type: 'teach'
        });

        if (!userSkill) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }

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
    .select('-password');

       const teachingSkills = await UserSkill.find({
    user: req.user._id,
    type: 'teach'
}).populate('skill');

       const completedSessions = await Session.find({
    teacher: req.user._id,
    status: 'completed'
});

const validCompletedSessions = completedSessions.filter(
    session => session.sessionValidity === 'valid'
);

const totalHours = validCompletedSessions.reduce((sum, session) => {
    return sum + ((session.actualDuration || 0) / 60);
}, 0);

const totalCompleted = validCompletedSessions.length;

        const totalScheduled = await Session.countDocuments({
            teacher: req.user._id
        });

        const completionRate = totalScheduled > 0
            ? Math.round((totalCompleted / totalScheduled) * 100)
            : 0;

        const uniqueStudents = new Set(
            completedSessions.map(session => session.student?.toString()).filter(Boolean)
        );

        res.json({
            success: true,
            data: {
                user,
                teachingSkills,
                level: user.level,
                creditRate:await user.getCreditRate(),
                canRedeem:await user.canRedeemCredits(),
                canHaveGroupSessions: user.canHaveGroupSessions(),
                stats: {
                    totalStudents: uniqueStudents.size || user.studentsCount || 0,
                    totalHours: Number(totalHours.toFixed(1)),
                    completionRate
                }
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
        
       if (bio !== undefined) req.user.bio = bio;
if (name !== undefined) req.user.name = name;
if (avatar !== undefined) req.user.avatar = avatar;

if (customCreditRate !== undefined && req.user.level >= 4) {
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
            .populate('session', 'status scheduledStart scheduledEnd')
            .sort({ createdAt: -1 });

        for (const request of requests) {
            await expireRequestIfNeeded(request);
        }

        const refreshedRequests = await SessionRequest.find(query)
            .populate('student', 'name email avatar rating')
            .populate('skill', 'name category')
            .populate('session', 'status scheduledStart scheduledEnd')
            .sort({ createdAt: -1 });

        const counts = {
            pending: await SessionRequest.countDocuments({ teacher: req.user._id, status: 'pending' }),
            negotiating: await SessionRequest.countDocuments({ teacher: req.user._id, status: 'negotiating' }),
            confirmed: await SessionRequest.countDocuments({ teacher: req.user._id, status: 'confirmed' }),
            rejected: await SessionRequest.countDocuments({ teacher: req.user._id, status: 'rejected' }),
            expired: await SessionRequest.countDocuments({ teacher: req.user._id, status: 'expired' }),
            total: refreshedRequests.length
        };

        res.json({
            success: true,
            data: {
                requests: refreshedRequests,
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

        if (!['pending', 'negotiating'].includes(sessionRequest.status)) {
            return res.status(400).json({
                success: false,
                message: 'Request is not open for acceptance'
            });
        }

        const session = await finalizeSessionRequest(sessionRequest);

        const io = req.app.get('io');
        if (io) {
            io.to(`user_${sessionRequest.student}`).emit('session_confirmed', {
                sessionId: session._id,
                requestId: sessionRequest._id,
                teacherName: req.user.name
            });
        }

        res.json({
            success: true,
            data: { session },
            message: 'Session confirmed successfully'
        });
    } catch (error) {
        console.error('Accept session request error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to accept request'
        });
    }
};

exports.suggestAlternateSlotByTeacher = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { proposedDate, proposedStartTime, duration, message } = req.body;

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

        if (!['pending', 'negotiating'].includes(sessionRequest.status)) {
            return res.status(400).json({
                success: false,
                message: 'Request is not open for negotiation'
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
                message: 'Invalid proposed time'
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
        sessionRequest.proposedBy = req.user._id;
        sessionRequest.lastActionBy = req.user._id;
        sessionRequest.teacherMessage = message || '';
        sessionRequest.lockExpiresAt = sessionRequest.expiresAt;

        sessionRequest.slotHistory.push({
            proposedBy: req.user._id,
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
            io.to(`user_${sessionRequest.student}`).emit('session_request_updated', {
                requestId: sessionRequest._id,
                updatedBy: 'teacher'
            });
        }

        res.json({
            success: true,
            message: 'Alternate slot suggested successfully',
            data: sessionRequest
        });
    } catch (error) {
        console.error('Suggest alternate slot by teacher error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to suggest alternate slot'
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

        if (!['pending', 'negotiating'].includes(sessionRequest.status)) {
            return res.status(400).json({
                success: false,
                message: 'Request already closed'
            });
        }

        sessionRequest.status = 'rejected';
        sessionRequest.teacherMessage = reason || 'Request rejected';
        sessionRequest.lastActionBy = req.user._id;
        sessionRequest.lockExpiresAt = null;
        await sessionRequest.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`user_${sessionRequest.student}`).emit('session_rejected', {
                requestId: sessionRequest._id,
                teacherName: req.user.name,
                reason: sessionRequest.teacherMessage
            });
        }

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
            scheduledStart: { $gte: now },
            status: { $in: ['confirmed', 'ongoing'] }
        })
            .populate('student', 'name email avatar')
            .populate('skill', 'name')
            .sort({ scheduledStart: 1 });

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

exports.getOngoingSessions = async (req, res) => {
    try {
        const sessions = await Session.find({
            teacher: req.user._id,
            status: 'ongoing'
        })
            .populate('student', 'name email avatar')
            .populate('skill', 'name')
            .sort({ updatedAt: -1 });

        res.json({
            success: true,
            data: sessions
        });
    } catch (error) {
        console.error('Get ongoing sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ongoing sessions'
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
            .populate('summary')
            .sort({ scheduledDate: -1 })
            .limit(50);

        // Show only completed sessions where teacher has NOT sent summary details yet
        const pendingSummarySessions = sessions.filter(session => {
            return !session.summary || session.summary.sentToStudent !== true;
        });

        // Calculate earnings from all completed sessions, not only pending summary sessions
        const totalEarned = sessions.reduce((sum, session) => {
            return sum + (session.sessionValidity === 'valid' ? session.creditsPerSession : 0);
        }, 0);

        res.json({
            success: true,
            data: {
                sessions: pendingSummarySessions,
                totalEarned,
                totalSessions: pendingSummarySessions.length
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
        
        // Generate roomId and joinCode if not exists
        if (!session.roomId) {
            session.roomId = `room_${session._id}_${Date.now()}`;
            session.joinCode = Math.random().toString(36).substr(2, 6).toUpperCase();
        }
        
         session.status = 'ongoing';
         session.actualStartTime = new Date();
        
        await session.save();
        
        // Notify student that session has started
        const io = req.app.get('io');
        if (io && session.student) {
            io.to(`user_${session.student}`).emit('session_started', {
                sessionId: session._id,
                sessionTitle: session.title,
                roomId: session.roomId,
                joinCode: session.joinCode
            });
            console.log(`Session started notification sent to student ${session.student}`);
        }
        
        res.json({
            success: true,
            data: {
                roomId: session.roomId,
                joinCode: session.joinCode
            },
            message: 'Session started successfully'
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

        const session = await completeSessionInternal({
            sessionId,
            endedBy: req.user._id,
            endedByRole: 'teacher',
            reason: 'Teacher ended meeting'
        });

        return res.json({
            success: true,
            data: session
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: 'Failed to complete session'
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
    (sum, session) => sum + (session.sessionValidity === 'valid' ? session.creditsPerSession : 0), 0
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
                creditRate: await req.user.getCreditRate(),
                level: req.user.level,
                canRedeem: await req.user.canRedeemCredits(),
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



// ==================== LEVEL FEATURES ====================

exports.getLevelFeatures = async (req, res) => {
    try {
        const level = req.user.level;
        
        const features = {
            level: level,
            creditRate:await req.user.getCreditRate(),
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
    { user: req.user._id, type: 'teach' },
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



//sendsessionsummarytostudent
exports.sendSessionSummaryToStudent = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { teacherNotes, homework, resources } = req.body;

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
                message: 'Unauthorized'
            });
        }

        if (session.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Only completed sessions can be sent'
            });
        }

        const cleanResources = Array.isArray(resources)
            ? resources
                .filter(r => r && r.url && r.url.trim())
                .map(r => ({
                    title: r.title || 'Resource',
                    url: r.url.trim(),
                    type: r.type || 'other'
                }))
            : [];

        const summary = await SessionSummary.findOneAndUpdate(
            { session: session._id },
            {
    $set: {
        teacherNotes: teacherNotes || '',
        homework: homework || '',
        resources: cleanResources,

        sentToStudent: true,
        sentAt: new Date()
    },
    $setOnInsert: {
        session: session._id,
        teacher: session.teacher,
        student: session.student
    }
},
            { upsert: true, new: true }
        );

        session.summary = summary._id;
        await session.save();

        return res.json({
            success: true,
            message: 'Summary details sent to student',
            data: summary
        });

    } catch (error) {
        console.error('Send summary error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send summary details'
        });
    }
};