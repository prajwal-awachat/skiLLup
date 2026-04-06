const mongoose = require('mongoose');

const sessionRequestSchema = new mongoose.Schema({
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    skill: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        maxlength: 500
    },
    preferredDate: {
        type: Date,
        required: true
    },
    preferredTime: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        required: true,
        min: 30,
        max: 180
    },
    proposedCredits: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'cancelled'],
        default: 'pending'
    },
    teacherMessage: {
        type: String,
        maxlength: 500
    },
    studentMessage: {
        type: String,
        maxlength: 500
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SessionRequest', sessionRequestSchema);