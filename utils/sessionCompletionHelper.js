const Session = require('../models/Session');
const SessionRequest = require('../models/SessionRequest');
const User = require('../models/User');

const {
    getSessionValidityMinutes,
    getSessionPartialMinutes
} = require('./settingsHelper');

async function completeSessionInternal({
    sessionId,
    endedBy,
    endedByRole,
    reason = 'Meeting ended'
}) {

    const session = await Session.findById(sessionId)
        .populate('teacher')
        .populate('student');

    if (!session) {
        throw new Error('Session not found');
    }

    // prevent duplicate completion
    if (session.status === 'completed') {
        return session;
    }

    const now = new Date();

    session.actualEndTime = now;
    session.meetingEndedAt = now;

    const durationMs =
        now - new Date(session.actualStartTime || now);

    const durationMinutes =
        Math.max(1, Math.round(durationMs / 60000));

    session.actualDuration = durationMinutes;

    const validMinutes =
        await getSessionValidityMinutes();

    const partialMinutes =
        await getSessionPartialMinutes();

    if (durationMinutes >= validMinutes) {
        session.sessionValidity = 'valid';
        session.ratingEligible = true;
    }
    else if (durationMinutes >= partialMinutes) {
        session.sessionValidity = 'partial';
        session.ratingEligible = false;
    }
    else {
        session.sessionValidity = 'invalid';
        session.ratingEligible = false;
    }

    session.status = 'completed';
    session.isCompleted = true;

    session.endedBy = endedBy;
    session.endedByRole = endedByRole;
    session.endedReason = reason;

   session.closedRoomId = session.roomId;
session.roomId = undefined;
session.joinCode = undefined;
session.meetingLink = '';

    // teacher earnings only for valid session
    if (session.sessionValidity === 'valid') {

        await session.teacher.addEarnings(
            session.creditsPerSession,
            session._id
        );

    }

    await session.save();

    if (session.sourceRequest) {
        await SessionRequest.findByIdAndUpdate(
            session.sourceRequest,
            {
                status: 'confirmed'
            }
        );
    }

    return session;
}

module.exports = {
    completeSessionInternal
};