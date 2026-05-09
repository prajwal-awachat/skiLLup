const mongoose = require('mongoose');

const roadmapSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Title of the roadmap (e.g. "Web Developer Roadmap")
    title: {
        type: String,
        required: true
    },

    // Optional: keep this field for compatibility with your existing project
    // but it is NOT required for ML-generated roadmaps.
    skill: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
        default: null
    },

    // Original text entered by the user
    goal: {
        type: String,
        required: true
    },

    // Predicted label from the ML model
    predictedCareer: {
        type: String,
        required: true
    },

    // Confidence returned by the ML model
    confidence: {
        type: Number,
        default: 0
    },

    currentLevel: {
        type: Number,
        default: 1,
        min: 1
    },

    targetLevel: {
        type: Number,
        default: 1,
        min: 1
    },

    milestones: [{
        level: {
            type: Number,
            required: true
        },
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            default: ''
        },
        skills: [{
            type: String
        }],
        estimatedDays: {
            type: Number,
            default: 0
        },
        isCompleted: {
            type: Boolean,
            default: false
        },
        completedAt: {
            type: Date,
            default: null
        }
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
    }
}, {
    timestamps: true
});

// Update progress based on completed milestones
roadmapSchema.methods.updateProgress = function () {
    const totalMilestones = this.milestones.length;

    if (totalMilestones === 0) {
        this.progress = 0;
        return this.progress;
    }

    const completedMilestones = this.milestones.filter(
        milestone => milestone.isCompleted
    ).length;

    this.progress = Math.round(
        (completedMilestones / totalMilestones) * 100
    );

    return this.progress;
};

module.exports = mongoose.model('Roadmap', roadmapSchema);