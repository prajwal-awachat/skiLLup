const mongoose = require('mongoose');

const roadmapSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    skill: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
        required: true
    },
    currentLevel: {
        type: Number,
        default: 1,
        min: 1,
        max: 13
    },
    targetLevel: {
        type: Number,
        default: 13,
        min: 1,
        max: 13
    },
    milestones: [{
        level: Number,
        title: String,
        description: String,
        skills: [String],
        estimatedDays: Number,
        isCompleted: {
            type: Boolean,
            default: false
        },
        completedAt: Date
    }],
    courses: [{
        title: String,
        description: String,
        url: String,
        duration: Number,
        isCompleted: {
            type: Boolean,
            default: false
        }
    }],
    resources: [{
        title: String,
        url: String,
        type: String
    }],
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    estimatedDays: {
        type: Number,
        default: 30
    },
    daysSpent: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
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

// Update progress based on completed milestones
roadmapSchema.methods.updateProgress = function() {
    const completed = this.milestones.filter(m => m.isCompleted).length;
    this.progress = (completed / this.milestones.length) * 100;
    return this.progress;
};

module.exports = mongoose.model('Roadmap', roadmapSchema);