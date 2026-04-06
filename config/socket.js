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
        
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });
};