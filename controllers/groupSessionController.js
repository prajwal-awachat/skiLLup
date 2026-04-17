// controllers/groupSessionController.js
const GroupSession = require('../models/GroupSession');
const User = require('../models/User');
const Skill = require('../models/Skill');

// Create group session (Teacher only, Level 5+)
exports.createGroupSession = async (req, res) => {
    try {
        // Check if teacher is level 5+
        if (req.user.level < 5) {
            return res.status(403).json({
                success: false,
                message: 'Only level 5+ teachers can create group sessions'
            });
        }
        
        const {
            skillId,
            title,
            description,
            creditsPerStudent,
            maxStudents,
            scheduledDate,
            scheduledTime,
            duration
        } = req.body;

         const sessionDuration = duration || 60;  //session:60 min by default
        
        // Validate skill
        const skill = await Skill.findById(skillId);
        if (!skill) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }
        
        // Check if teacher teaches this skill
        const teachesSkill = req.user.teachingSkills.includes(skillId);
        if (!teachesSkill) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to teach this skill'
            });
        }
        
        // Validate max students
        if (maxStudents < 2 || maxStudents > 50) {
            return res.status(400).json({
                success: false,
                message: 'Max students must be between 2 and 50'
            });
        }
        
        // Create group session
        const groupSession = await GroupSession.create({
            teacher: req.user._id,
            skill: skillId,
            title,
            description,
            creditsPerStudent,
            maxStudents,
            scheduledDate: new Date(scheduledDate),
            scheduledTime,
            duration: sessionDuration,
            status: 'scheduled'
        });
        
        res.status(201).json({
            success: true,
            data: groupSession,
            message: 'Group session created successfully'
        });
    } catch (error) {
        console.error('Create group session error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get available group sessions (Students)
exports.getAvailableGroupSessions = async (req, res) => {
    try {
        const now = new Date();
        
        const sessions = await GroupSession.find({
            scheduledDate: { $gte: now },
            status: 'scheduled'
        })
            .populate('teacher', 'name email avatar rating')
            .populate('skill', 'name category')
            .populate('enrolledStudents.student', 'name email')
            .sort({ scheduledDate: 1, scheduledTime: 1 });
        
        // Add current enrollment count
        const sessionsWithCount = sessions.map(session => ({
            ...session.toObject(),
            currentStudents: session.enrolledStudents.length,
            availableSpots: session.maxStudents - session.enrolledStudents.length
        }));
        
        res.json({
            success: true,
            data: sessionsWithCount
        });
    } catch (error) {
        console.error('Get available group sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch group sessions'
        });
    }
};

// Get teacher's group sessions
exports.getTeacherGroupSessions = async (req, res) => {
    try {
        const sessions = await GroupSession.find({
            teacher: req.user._id
        })
            .populate('skill', 'name')
            .populate('enrolledStudents.student', 'name email avatar')
            .sort({ scheduledDate: -1 });
        
        res.json({
            success: true,
            data: sessions
        });
    } catch (error) {
        console.error('Get teacher group sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sessions'
        });
    }
};

// Enroll in group session (Student)
exports.enrollInGroupSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const groupSession = await GroupSession.findById(sessionId);
        
        if (!groupSession) {
            return res.status(404).json({
                success: false,
                message: 'Group session not found'
            });
        }
        
        // Check if session is scheduled
        if (groupSession.status !== 'scheduled') {
            return res.status(400).json({
                success: false,
                message: 'Session is no longer available'
            });
        }
        
        // Check if session is full
        if (groupSession.isFull()) {
            return res.status(400).json({
                success: false,
                message: 'Session is full'
            });
        }
        
        // Check if already enrolled
        const alreadyEnrolled = groupSession.enrolledStudents.some(
            s => s.student.toString() === req.user._id.toString()
        );
        
        if (alreadyEnrolled) {
            return res.status(400).json({
                success: false,
                message: 'Already enrolled in this session'
            });
        }
        
        // Check if student has enough credits
        if (req.user.credits < groupSession.creditsPerStudent) {
            return res.status(400).json({
                success: false,
                message: `Insufficient credits. Need ${groupSession.creditsPerStudent} credits`
            });
        }
        
        // Deduct credits
        await req.user.deductCredits(groupSession.creditsPerStudent, sessionId);
        
        // Add student to session
        await groupSession.addStudent(req.user._id, groupSession.creditsPerStudent);
        
        // Add credits to teacher (when session starts, not now)
        // Teacher gets credits only after session completion
        
        res.json({
            success: true,
            data: {
                session: groupSession,
                creditsRemaining: req.user.credits
            },
            message: `Successfully enrolled! ${groupSession.getStudentCount()}/${groupSession.maxStudents} students enrolled`
        });
    } catch (error) {
        console.error('Enroll in group session error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Start group session (Teacher)
exports.startGroupSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const groupSession = await GroupSession.findById(sessionId)
            .populate('teacher', 'name email')
            .populate('enrolledStudents.student', 'name email');
        
        if (!groupSession) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        // Check if user is the teacher
        if (groupSession.teacher._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Only the teacher can start this session'
            });
        }
        
        // Generate room ID and join code if not exists
        if (!groupSession.roomId) {
            groupSession.roomId = `group_${groupSession._id}_${Date.now()}`;
            groupSession.joinCode = Math.random().toString(36).substr(2, 8).toUpperCase();
            await groupSession.save();
        }
        
        groupSession.status = 'ongoing';
          if (!groupSession.actualStartTime) {
         groupSession.actualStartTime = new Date();
          }
         await groupSession.save();
        
        // Notify all enrolled students
        const io = req.app.get('io');
        groupSession.enrolledStudents.forEach(enrolled => {
            io.to(`user_${enrolled.student._id}`).emit('group_session_started', {
                sessionId: groupSession._id,
                sessionTitle: groupSession.title,
                roomId: groupSession.roomId,
                joinCode: groupSession.joinCode,
                teacherName: groupSession.teacher.name
            });
        });
        
        res.json({
            success: true,
            data: {
                roomId: groupSession.roomId,
                joinCode: groupSession.joinCode,
                enrolledCount: groupSession.enrolledStudents.length,
                maxStudents: groupSession.maxStudents
            },
            message: 'Group session started!'
        });
    } catch (error) {
        console.error('Start group session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start session'
        });
    }
};

// Complete group session and distribute credits
exports.completeGroupSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const groupSession = await GroupSession.findById(sessionId)
            .populate('teacher');
        
        if (!groupSession) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        if (groupSession.teacher._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Only the teacher can complete this session'
            });
        }
        
        if (groupSession.status !== 'ongoing') {
            return res.status(400).json({
                success: false,
                message: 'Session is not ongoing'
            });
        }
        
        const endTime = new Date();
const actualDuration = groupSession.actualStartTime
    ? Math.floor((endTime - groupSession.actualStartTime) / (1000 * 60))
    : 0;

groupSession.actualEndTime = endTime;
groupSession.actualDuration = actualDuration;

const totalCreditsEarned = groupSession.enrolledStudents.length * groupSession.creditsPerStudent;

if (actualDuration < 20) {
    groupSession.sessionValidity = 'invalid';

    // refund all enrolled students
    for (const enrolled of groupSession.enrolledStudents) {
        const student = await User.findById(enrolled.student);
        if (student) {
            student.credits += enrolled.creditsPaid;
            student.totalCreditsSpent = Math.max(0, (student.totalCreditsSpent || 0) - enrolled.creditsPaid);
            await student.save();
        }
    }
} else if (actualDuration >= 20 && actualDuration < 35) {
    groupSession.sessionValidity = 'partial';
    // teacher gets nothing
} else {
    groupSession.sessionValidity = 'valid';
    await groupSession.teacher.addEarnings(totalCreditsEarned, sessionId);
}

groupSession.status = 'completed';
await groupSession.save();
        
        // Notify students
        const io = req.app.get('io');
        groupSession.enrolledStudents.forEach(enrolled => {
            io.to(`user_${enrolled.student}`).emit('group_session_completed', {
                sessionId: groupSession._id,
                sessionTitle: groupSession.title
            });
        });
        
        res.json({
            success: true,
            data: {
                totalCreditsEarned,
                studentCount: groupSession.enrolledStudents.length,
                creditsPerStudent: groupSession.creditsPerStudent
            },
            message: 'Session completed! Credits distributed.'
        });
    } catch (error) {
        console.error('Complete group session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete session'
        });
    }
};

// Join group meeting (Student/Teacher)
exports.joinGroupMeeting = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const groupSession = await GroupSession.findById(sessionId)
            .populate('teacher', 'name email avatar')
            .populate('enrolledStudents.student', 'name email avatar');
        
        if (!groupSession) {
            return res.status(404).send('Session not found');
        }
        
        // Check if user is teacher or enrolled student
        const isTeacher = groupSession.teacher._id.toString() === req.user._id.toString();
        const isEnrolled = groupSession.enrolledStudents.some(
            s => s.student._id.toString() === req.user._id.toString()
        );
        
        if (!isTeacher && !isEnrolled) {
            return res.status(403).send('You are not enrolled in this session');
        }
        
        // Check if session is ongoing
        if (groupSession.status !== 'ongoing') {
            return res.render('waiting-room', {
                user: req.user,
                session: groupSession,
                message: 'Session has not started yet'
            });
        }
        
        res.render('group-meeting', {
            user: req.user,
            session: {
                id: groupSession._id,
                roomId: groupSession.roomId,
                joinCode: groupSession.joinCode,
                title: groupSession.title,
                teacher: groupSession.teacher,
                enrolledStudents: groupSession.enrolledStudents,
                maxStudents: groupSession.maxStudents,
                isTeacher: isTeacher
            }
        });
    } catch (error) {
        console.error('Join group meeting error:', error);
        res.status(500).send('Failed to load meeting');
    }
};