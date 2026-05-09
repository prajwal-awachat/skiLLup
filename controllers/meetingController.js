const Session = require('../models/Session');
const User = require('../models/User');
const SessionRequest = require('../models/SessionRequest');
const Transaction = require('../models/Transaction');
const {
    completeSessionInternal
} = require('../utils/sessionCompletionHelper');

// Render meeting page with validation
exports.joinMeeting = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await Session.findById(sessionId)
            .populate('teacher', 'name email')
            .populate('student', 'name email');
        
        if (!session) {
            return res.status(404).send('Session not found');
        }
        
        // Check if user is participant
        const isTeacher = session.teacher._id.toString() === req.user._id.toString();
        const isStudent = session.student && session.student._id.toString() === req.user._id.toString();
        const isEnrolled = session.enrolledStudents && session.enrolledStudents.some(s => s._id.toString() === req.user._id.toString());
        
        if (!isTeacher && !isStudent && !isEnrolled) {
            return res.status(403).send('You are not authorized to join this session');
        }

        if (session.status !== 'ongoing' && !isTeacher) {
            return res.status(400).send('Session has not started yet. Wait for the teacher to start the session.');
           }
        
        res.render('meeting', {
            user: req.user,
            session: {
                id: session._id,
                roomId: session.roomId,
                joinCode: session.joinCode,
                title: session.title,
                teacher: session.teacher,
                student: session.student,
                status: session.status,
                isTeacher: isTeacher
            }
        });
    } catch (error) {
        console.error('Join meeting error:', error);
        res.status(500).send('Failed to load meeting');
    }
};

// Validate join code API
exports.getMeetingInfo = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { roomId, joinCode } = req.query;
        
        const session = await Session.findById(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        // Check if session is ongoing
        if (session.status !== 'ongoing') {
            return res.status(400).json({
                success: false,
                message: 'Session has not started yet'
            });
        }
        
        // Validate room ID and join code
        if (session.roomId !== roomId) {
            return res.status(401).json({
                success: false,
                message: 'Invalid session ID'
            });
        }
        
        if (session.joinCode !== joinCode) {
            return res.status(401).json({
                success: false,
                message: 'Invalid join code'
            });
        }
        
        res.json({
            success: true,
            data: {
                roomId: session.roomId,
                title: session.title,
                teacherName: session.teacher?.name || 'Teacher'
            }
        });
    } catch (error) {
        console.error('Validate meeting error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate meeting'
        });
    }
};


exports.endMeetingEarlyByStudent = async (req, res) => {
    try {

        const { sessionId } = req.params;

        const session = await completeSessionInternal({
            sessionId,
            endedBy: req.user._id,
            endedByRole: 'student',
            reason: 'Student ended meeting'
        });

        return res.json({
            success: true,
            data: session
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: 'Failed to end session'
        });
    }
};

exports.submitRating = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { rating, review } = req.body;

        const numericRating = Number(rating);

        if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be an integer from 1 to 5'
            });
        }

        const session = await Session.findById(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // only student can rate
        if (session.student.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        // only valid sessions can be rated
        if (!session.ratingEligible || session.sessionValidity !== 'valid') {
            return res.status(400).json({
                success: false,
                message: 'Rating is allowed only for valid sessions'
            });
        }

        if (session.ratingGiven) {
            return res.status(400).json({
                success: false,
                message: 'You already rated this session'
            });
        }

        const teacher = await User.findById(session.teacher);

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: 'Teacher not found'
            });
        }

        const oldTotalReviews = Number(teacher.totalReviews || 0);
        const oldRating = Number(teacher.rating || 0);

        const newTotalReviews = oldTotalReviews + 1;
        const newAverageRating =
            ((oldRating * oldTotalReviews) + numericRating) / newTotalReviews;

        teacher.rating = Number(newAverageRating.toFixed(2));
        teacher.totalReviews = newTotalReviews;

        // level update from overall rating
        const newLevel = teacher.calculateLevelFromRating();
        teacher.level = newLevel;

        await teacher.save();

        session.teacherRating = numericRating;
        session.teacherReview = (review || '').trim();
        session.ratingGiven = true;

        await session.save();

        return res.json({
            success: true,
            message: 'Rating submitted successfully',
            data: {
                teacherRating: teacher.rating,
                teacherTotalReviews: teacher.totalReviews,
                teacherLevel: teacher.level
            }
        });
    } catch (error) {
        console.error('Rating error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit rating'
        });
    }
};