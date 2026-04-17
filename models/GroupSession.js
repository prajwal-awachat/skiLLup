// models/GroupSession.js
const mongoose = require('mongoose');

const groupSessionSchema = new mongoose.Schema({
    teacher: {
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
        required: true,
        trim: true
    },
    description: {
        type: String,
        maxlength: 1000
    },
    creditsPerStudent: {
        type: Number,
        required: true,
        min: 1
    },
    maxStudents: {
        type: Number,
        default: 50,
        min: 2,
        max: 50
    },
    enrolledStudents: [{
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        creditsPaid: Number
    }],
    scheduledDate: {
        type: Date,
        required: true
    },
    scheduledTime: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        required: true,
        min: 30,
        max: 240
    },
    status: {
        type: String,
        enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
        default: 'scheduled'
    },
    roomId: {
        type: String,
        unique: true,
        sparse: true
    },
    joinCode: {
        type: String,
        unique: true,
        sparse: true
    },
    meetingLink: {
        type: String,
        default: ''
    },
    teacherRating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    totalReviews: {
        type: Number,
        default: 0
    },
   createdAt: {
    type: Date,
    default: Date.now
},
actualStartTime: {
    type: Date
},
actualEndTime: {
    type: Date
},
actualDuration: {
    type: Number,
    default: 0
},
sessionValidity: {
    type: String,
    enum: ['invalid', 'partial', 'valid'],
    default: 'invalid'
},
endedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
},
endedByRole: {
    type: String,
    enum: ['teacher', 'student', 'system']
},
endedReason: {
    type: String,
    default: ''
},
autoEnded: {
    type: Boolean,
    default: false
}
});

// Generate room ID and join code
groupSessionSchema.pre('save', async function(next) {
    if (this.isNew && !this.roomId) {
        this.roomId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.joinCode = Math.random().toString(36).substr(2, 8).toUpperCase();
    }
    next();
});

// Check if session is full
groupSessionSchema.methods.isFull = function() {
    return this.enrolledStudents.length >= this.maxStudents;
};

// Add student to session
groupSessionSchema.methods.addStudent = async function(studentId, creditsPaid) {
    if (this.isFull()) {
        throw new Error('Group session is full');
    }
    
    const alreadyEnrolled = this.enrolledStudents.some(
        s => s.student.toString() === studentId.toString()
    );
    
    if (alreadyEnrolled) {
        throw new Error('Student already enrolled');
    }
    
    this.enrolledStudents.push({
        student: studentId,
        creditsPaid: creditsPaid
    });
    
    await this.save();
};

// Get current student count
groupSessionSchema.methods.getStudentCount = function() {
    return this.enrolledStudents.length;
};

module.exports = mongoose.model('GroupSession', groupSessionSchema);