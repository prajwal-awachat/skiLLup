const mongoose = require('mongoose');

const userSkillSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    skill: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
        required: true
    },

    type: {
        type: String,
        enum: ['learn', 'teach'],
        required: true
    },

    proficiencyLevel: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert'],
        default: 'beginner'
    },

    yearsOfExperience: {
        type: Number,
        min: 0,
        default: 0
    },

    hourlyRate: {
        type: Number,
        min: 0,
        default: 0
    },

    isAvailable: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

userSkillSchema.index({ user: 1, skill: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('UserSkill', userSkillSchema);