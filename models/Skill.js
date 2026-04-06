const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Programming', 'Data Science', 'Design', 'Business', 'Language', 'Marketing', 'Other']
    },
    description: {
        type: String,
        maxlength: 500
    },
    popularity: {
        type: Number,
        default: 0
    },
    totalTeachers: {
        type: Number,
        default: 0
    },
    totalStudents: {
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
    }
});

module.exports = mongoose.model('Skill', skillSchema);