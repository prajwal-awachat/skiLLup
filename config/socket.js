const { Message, Conversation } = require('../models/Message');
const User = require('../models/User');

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
socket.on('join_meeting_room', (roomId) => {
    socket.join(`meeting_${roomId}`);
    socket.to(`meeting_${roomId}`).emit('user-joined', { userId: socket.userId });
});

socket.on('join-meeting', ({ roomId, userId }) => {
    socket.join(`meeting_${roomId}`);
    socket.to(`meeting_${roomId}`).emit('user-joined', { userId });
});

socket.on('leave-meeting', ({ roomId, userId }) => {
    socket.to(`meeting_${roomId}`).emit('user-left', { userId });
    socket.leave(`meeting_${roomId}`);
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
socket.on('join-group-meeting', ({ roomId, userId, userName }) => {
    socket.join(`group_meeting_${roomId}`);
    socket.roomId = roomId;
    socket.userId = userId;
    socket.userName = userName;
    
    // Notify others in the room
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
socket.on('leave-group-meeting', ({ roomId, userId, userName }) => {
    socket.leave(`group_meeting_${roomId}`);
    socket.to(`group_meeting_${roomId}`).emit('user-left-group', {
        userId,
        userName
    });
});
        
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });




};