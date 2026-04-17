const Session = require('../models/Session');
const User = require('../models/User');
const SessionRequest = require('../models/SessionRequest');

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
        const { reason } = req.body;

        const session = await Session.findById(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        const isStudent = session.student && session.student.toString() === req.user._id.toString();

        if (!isStudent) {
            return res.status(403).json({
                success: false,
                message: 'Only the student can use this action'
            });
        }

        if (session.status !== 'ongoing') {
            return res.status(400).json({
                success: false,
                message: 'Session is not ongoing'
            });
        }

        const now = new Date();
        const startTime = session.actualStartTime || now;
        const duration = Math.max(0, Math.floor((now - startTime) / (1000 * 60)));

        // student special early exit allowed only within first 20 min
        if (duration >= 20) {
            return res.status(400).json({
                success: false,
                message: 'Early student exit is allowed only within first 20 minutes'
            });
        }

        const student = await User.findById(session.student);

        session.actualEndTime = now;
        session.actualDuration = duration;
        session.sessionValidity = 'invalid';
        session.status = 'completed';
        session.isCompleted = true;
        session.endedBy = req.user._id;
        session.endedByRole = 'student';
        session.endedReason = reason || 'Student ended early within first 20 minutes';
        session.ratingEligible = false;
        session.updatedAt = now;

        const roomIdToEmit = session.roomId;

        session.set('roomId', undefined);
        session.set('joinCode', undefined);
        session.meetingLink = '';

        await session.save();

        // refund student
        student.credits += session.creditsPerSession;
        student.totalCreditsSpent = Math.max(0, (student.totalCreditsSpent || 0) - session.creditsPerSession);
        await student.save();

        await SessionRequest.findOneAndUpdate(
            { session: session._id },
            {
                $set: {
                    status: 'completed',
                    teacherMessage: 'Session ended early by student',
                    updatedAt: new Date()
                }
            }
        );

        const io = req.app.get('io');
        if (io && roomIdToEmit) {
           io.to(`meeting_${roomIdToEmit}`).emit('meeting-ended', {
    sessionId: session._id,
    endedBy: req.user._id,
    endedByName: req.user.name,
    message: 'Student ended the session within first 20 minutes.',
    sessionValidity: 'invalid',
    ratingEligible: false
});

            io.in(`meeting_${roomIdToEmit}`).socketsLeave(`meeting_${roomIdToEmit}`);
        }

        return res.json({
            success: true,
            message: 'Session ended early. Credits refunded to student.'
        });
    } catch (error) {
        console.error('End early by student error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to end session early'
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