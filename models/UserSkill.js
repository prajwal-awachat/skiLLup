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
  proficiencyLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    default: 'beginner'
  },
  isTeaching: {
    type: Boolean,
    default: false // false means learning, true means teaching
  },
  yearsOfExperience: {
    type: Number,
    min: 0,
    default: 0
  },
  hourlyRate: {
    type: Number, // in credits
    min: 0,
    default: 2
  },
  isAvailable: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Ensure one user-skill combination is unique
userSkillSchema.index({ user: 1, skill: 1 }, { unique: true });

module.exports = mongoose.model('UserSkill', userSkillSchema);