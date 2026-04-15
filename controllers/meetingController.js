const Session = require('../models/Session');

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