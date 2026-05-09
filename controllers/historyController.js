const Session = require('../models/Session');

exports.getHistoryPage = async (req, res) => {
    res.render('history', {
        user: req.user
    });
};

exports.getCompletedSessions = async (req, res) => {
    try {
        const sessions = await Session.find({
            student: req.user._id,
            status: 'completed'
        })
            .populate('teacher', 'name email')
            .populate('student', 'name email')
            .populate('skill', 'name')
            .populate('summary')
            .sort({ updatedAt: -1 });

        const totalSessions = sessions.length;

        const totalMinutes = sessions.reduce((sum, session) => {
            return sum + Number(session.actualDuration || session.duration || 0);
        }, 0);

        const totalCreditsSpent = sessions.reduce((sum, session) => {
            return sum + Number(session.creditsPerSession || 0);
        }, 0);

        return res.json({
            success: true,
            data: {
                sessions,
                stats: {
                    totalSessions,
                    totalHours: totalMinutes / 60,
                    totalCreditsSpent
                }
            }
        });
    } catch (error) {
        console.error('History sessions error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to load session history'
        });
    }
};