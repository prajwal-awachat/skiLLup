const { Message, Conversation } = require('../models/Message');
const User = require('../models/User');
const Session = require('../models/Session');
const GroupSession = require('../models/GroupSession');

const meetingTimers = new Map();
const groupMeetingTimers = new Map();

function clearMeetingTimerSet(roomId, isGroup = false) {
    const store = isGroup ? groupMeetingTimers : meetingTimers;
    const timers = store.get(roomId);

    if (timers) {
        timers.forEach(timer => clearTimeout(timer));
        store.delete(roomId);
    }
}

async function scheduleOneToOneReminders(io, session) {
    if (!session || !session.roomId) return;
    if (meetingTimers.has(session.roomId)) return;

    const roomKey = `meeting_${session.roomId}`;
    const timers = [];

    timers.push(setTimeout(async () => {
        await Session.updateOne({ _id: session._id }, { reminder20Sent: true });
        io.to(roomKey).emit('session-warning', {
            type: '20min',
            message: '20 minutes completed. Student can no longer end session for free.'
        });
    }, 20 * 60 * 1000));

    timers.push(setTimeout(async () => {
        await Session.updateOne({ _id: session._id }, { reminder35Sent: true });
        io.to(roomKey).emit('session-warning', {
            type: '35min',
            message: '35 minutes completed. Session is now fully valid.'
        });
    }, 35 * 60 * 1000));

    timers.push(setTimeout(async () => {
        await Session.updateOne({ _id: session._id }, { reminder45Sent: true });
        io.to(roomKey).emit('session-warning', {
            type: '45min',
            message: '45 minutes completed. Good time to start summarizing key points.'
        });
    }, 45 * 60 * 1000));

    timers.push(setTimeout(async () => {
        await Session.updateOne({ _id: session._id }, { reminder55Sent: true });
        io.to(roomKey).emit('session-warning', {
            type: '55min',
            message: '5 minutes left. Please wrap up the session.'
        });
    }, 55 * 60 * 1000));

    timers.push(setTimeout(async () => {
        const latestSession = await Session.findById(session._id);

        if (!latestSession || latestSession.status === 'completed') {
            clearMeetingTimerSet(session.roomId, false);
            return;
        }

        const endTime = new Date();
        const actualDuration = latestSession.actualStartTime
            ? Math.floor((endTime - latestSession.actualStartTime) / (1000 * 60))
            : 60;

        latestSession.actualEndTime = endTime;
        latestSession.actualDuration = actualDuration;
        latestSession.status = 'completed';
         latestSession.isCompleted = true;
        latestSession.autoEnded = true;
        latestSession.endedByRole = 'system';
        latestSession.endedReason = 'Auto ended at 60 minutes';
        await latestSession.save();

        io.to(roomKey).emit('meeting-ended', {
            sessionId: latestSession._id,
            endedByName: 'System',
            message: 'Session automatically ended after 60 minutes.'
        });

        clearMeetingTimerSet(session.roomId, false);
    }, 60 * 60 * 1000));

    meetingTimers.set(session.roomId, timers);
}

async function scheduleGroupReminders(io, groupSession) {
    if (!groupSession || !groupSession.roomId) return;
    if (groupMeetingTimers.has(groupSession.roomId)) return;

    const roomKey = `group_meeting_${groupSession.roomId}`;
    const timers = [];

    timers.push(setTimeout(() => {
        io.to(roomKey).emit('session-warning', {
            type: '20min',
            message: '20 minutes completed.'
        });
    }, 20 * 60 * 1000));

    timers.push(setTimeout(() => {
        io.to(roomKey).emit('session-warning', {
            type: '35min',
            message: '35 minutes completed. Group session is now fully valid.'
        });
    }, 35 * 60 * 1000));

    timers.push(setTimeout(() => {
        io.to(roomKey).emit('session-warning', {
            type: '45min',
            message: '45 minutes completed. Start summarizing key points.'
        });
    }, 45 * 60 * 1000));

    timers.push(setTimeout(() => {
        io.to(roomKey).emit('session-warning', {
            type: '55min',
            message: '5 minutes left. Please wrap up the session.'
        });
    }, 55 * 60 * 1000));

    timers.push(setTimeout(async () => {
        const latestGroup = await GroupSession.findById(groupSession._id);

        if (!latestGroup || latestGroup.status === 'completed') {
            clearMeetingTimerSet(groupSession.roomId, true);
            return;
        }

        const endTime = new Date();
        const actualDuration = latestGroup.actualStartTime
            ? Math.floor((endTime - latestGroup.actualStartTime) / (1000 * 60))
            : 60;

        latestGroup.actualEndTime = endTime;
        latestGroup.actualDuration = actualDuration;
        latestGroup.autoEnded = true;
        latestGroup.endedByRole = 'system';
        latestGroup.endedReason = 'Auto ended at 60 minutes';
        latestGroup.status = 'completed';
        await latestGroup.save();

        io.to(roomKey).emit('meeting-ended', {
            sessionId: latestGroup._id,
            endedByName: 'System',
            message: 'Group session automatically ended after 60 minutes.'
        });

        clearMeetingTimerSet(groupSession.roomId, true);
    }, 60 * 60 * 1000));

    groupMeetingTimers.set(groupSession.roomId, timers);
}

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);
        
        // User joins their personal room
        socket.on('register_user', (userId) => {
            socket.join(`user_${userId}`);
            console.log(`User ${userId} joined their room`);
        });
        
        // Join conversation room
        socket.on('join_conversation', (conversationId) => {
            socket.join(`conversation_${conversationId}`);
            console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
        });
        
        // Leave conversation room
        socket.on('leave_conversation', (conversationId) => {
            socket.leave(`conversation_${conversationId}`);
        });
        
        // Handle typing indicator
        socket.on('typing', (data) => {
            const { conversationId, userId, isTyping } = data;
            socket.to(`conversation_${conversationId}`).emit('user_typing', {
                userId,
                isTyping
            });
        });

        // Meeting room management
socket.on('join_meeting_room', async ({ roomId, userId, isReconnect = false }) => {
    const Session = require('../models/Session');

    socket.join(`meeting_${roomId}`);
    socket.userId = userId;

    const session = await Session.findOne({ roomId });

    if (!session) return;

    if (!session.actualStartTime) {
    session.actualStartTime = new Date();
    await session.save();

    console.log("⏱ Session timer started");

    await scheduleOneToOneReminders(io, session);
} else if (!meetingTimers.has(roomId)) {
    await scheduleOneToOneReminders(io, session);
}

    socket.to(`meeting_${roomId}`).emit('user-joined', { userId, isReconnect });
});

socket.on('join-meeting', ({ roomId, userId }) => {
    socket.join(`meeting_${roomId}`);
    socket.to(`meeting_${roomId}`).emit('user-joined', { userId });
});

socket.on('leave-meeting', async ({ roomId, userId, userName }) => {
    try {
        const Session = require('../models/Session');
        const session = await Session.findOne({ roomId });

        if (!session || session.status === 'completed') {
            socket.leave(`meeting_${roomId}`);
            return;
        }

        const now = new Date();

        if (session.actualStartTime) {
            session.actualEndTime = now;
            session.actualDuration = Math.max(
                0,
                Math.floor((now - session.actualStartTime) / (1000 * 60))
            );
        }

        session.endedBy = userId;
        session.endedByRole = session.teacher.toString() === String(userId) ? 'teacher' : 'student';
        session.endedReason = `${userName || 'A participant'} left the meeting`;
        await session.save();

        io.to(`meeting_${roomId}`).emit('meeting-ended', {
            roomId,
            sessionId: session._id,
            endedBy: userId,
            endedByName: userName || 'Participant',
            message: `${userName || 'A participant'} left the meeting. Session ended for both users.`
        });

        clearMeetingTimerSet(roomId, false);
        io.in(`meeting_${roomId}`).socketsLeave(`meeting_${roomId}`);
    } catch (error) {
        console.error('leave-meeting error:', error);
    }
});

socket.on('meeting-ended', async ({ roomId, sessionId, endedBy, endedByName, message, sessionValidity, ratingEligible }) => {
    try {
        const session = await Session.findById(sessionId);

        if (session && session.actualStartTime && session.status !== 'completed') {
            const now = new Date();
            session.actualEndTime = now;
            session.actualDuration = Math.max(
                0,
                Math.floor((now - session.actualStartTime) / (1000 * 60))
            );
            session.endedBy = endedBy;
            session.endedByRole = session.teacher.toString() === String(endedBy) ? 'teacher' : 'student';
            session.endedReason = message || 'Meeting manually ended';
            await session.save();
        }

       io.to(`meeting_${roomId}`).emit('meeting-ended', {
    roomId,
    sessionId,
    endedBy,
    endedByName,
    message: message || `${endedByName || 'Participant'} ended the session.`,
    sessionValidity: sessionValidity || null,
    ratingEligible: !!ratingEligible
});

        clearMeetingTimerSet(roomId, false);
        io.in(`meeting_${roomId}`).socketsLeave(`meeting_${roomId}`);
    } catch (error) {
        console.error('meeting-ended socket error:', error);
    }
});

// WebRTC Signaling
socket.on('offer', ({ offer, roomId }) => {
    socket.to(`meeting_${roomId}`).emit('offer', offer);
});

socket.on('answer', ({ answer, roomId }) => {
    socket.to(`meeting_${roomId}`).emit('answer', answer);
});

socket.on('ice-candidate', ({ candidate, roomId }) => {
    socket.to(`meeting_${roomId}`).emit('ice-candidate', candidate);
});

// Meeting chat
socket.on('meeting-chat', (data) => {
    socket.to(`meeting_${data.roomId}`).emit('meeting-chat', data);
});

// Group meeting room management
socket.on('join-group-meeting', async ({ roomId, userId, userName }) => {
    socket.join(`group_meeting_${roomId}`);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.userName = userName;

    const groupSession = await GroupSession.findOne({ roomId });

    if (groupSession) {
        if (!groupSession.actualStartTime) {
            groupSession.actualStartTime = new Date();
            await groupSession.save();
            await scheduleGroupReminders(io, groupSession);
        } else if (!groupMeetingTimers.has(roomId)) {
            await scheduleGroupReminders(io, groupSession);
        }
    }

    socket.to(`group_meeting_${roomId}`).emit('user-joined-group', {
        userId,
        userName,
        userCount: io.sockets.adapter.rooms.get(`group_meeting_${roomId}`)?.size || 0
    });

    console.log(`${userName} joined group meeting ${roomId}`);
});

// Group WebRTC signaling
socket.on('group-offer', ({ offer, roomId, targetUserId }) => {
    socket.to(`group_meeting_${roomId}`).emit('group-offer', {
        offer,
        from: socket.userId,
        fromName: socket.userName
    });
});

socket.on('group-answer', ({ answer, roomId, targetUserId }) => {
    socket.to(`group_meeting_${roomId}`).emit('group-answer', {
        answer,
        from: socket.userId
    });
});

socket.on('group-ice-candidate', ({ candidate, roomId, targetUserId }) => {
    socket.to(`group_meeting_${roomId}`).emit('group-ice-candidate', {
        candidate,
        from: socket.userId
    });
});

// Group chat
socket.on('group-chat-message', ({ roomId, message, userName }) => {
    io.to(`group_meeting_${roomId}`).emit('group-chat-message', {
        message,
        userName,
        timestamp: new Date().toISOString()
    });
});

// Leave group meeting
socket.on('leave-group-meeting', async ({ roomId, userId, userName }) => {
    const groupSession = await GroupSession.findOne({ roomId });

    if (groupSession && groupSession.actualStartTime && groupSession.status !== 'completed') {
        const now = new Date();
        groupSession.actualEndTime = now;
        groupSession.actualDuration = Math.floor((now - groupSession.actualStartTime) / (1000 * 60));
        groupSession.endedBy = userId;
        await groupSession.save();
    }

    socket.leave(`group_meeting_${roomId}`);
    socket.to(`group_meeting_${roomId}`).emit('user-left-group', {
        userId,
        userName
    });
});
        
        socket.on('disconnect', (reason) => {
                   console.log('Client disconnected:', socket.id, reason);
              });
    });




};