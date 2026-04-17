const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
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
        required: true,
        trim: true
    },
    description: {
        type: String,
        maxlength: 1000
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled', 'rejected'],
        default: 'pending'
    },
    sessionType: {
        type: String,
        enum: ['one-on-one', 'group'],
        default: 'one-on-one'
    },
    maxStudents: {
        type: Number,
        default: 1,
        description: 'For group sessions, max participants'
    },
    enrolledStudents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    creditsPerSession: {
        type: Number,
        required: true
    },
    duration: {
        type: Number,
        required: true,
        description: 'Duration in minutes'
    },
    scheduledDate: {
        type: Date,
        required: true
    },
    scheduledTime: {
        type: String,
        required: true
    },
    meetingLink: {
        type: String,
        default: ''
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
    notes: {
        type: String,
        maxlength: 5000
    },
    summary: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SessionSummary'
    },
    teacherRating: {
        type: Number,
        min: 0,
        max: 5
    },
    teacherReview: {
        type: String,
        maxlength: 500
    },
    studentRating: {
        type: Number,
        min: 0,
        max: 5
    },
    studentReview: {
        type: String,
        maxlength: 500
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    actualStartTime: Date,
    actualEndTime: Date,
    actualDuration: {
        type: Number,
        default: 0
    },
    sessionValidity: {
    type: String,
       enum: ['invalid', 'partial', 'valid'],
        default: 'invalid'
     },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
    type: Date,
    default: Date.now
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
    maxlength: 500,
    default: ''
},
reminder20Sent: {
    type: Boolean,
    default: false
},
reminder35Sent: {
    type: Boolean,
    default: false
},
reminder45Sent: {
    type: Boolean,
    default: false
},
reminder55Sent: {
    type: Boolean,
    default: false
},
autoEnded: {
    type: Boolean,
    default: false
},ratingGiven: {
    type: Boolean,
    default: false
},
ratingEligible: {
    type: Boolean,
    default: false
}
});

// Generate unique room ID and join code
sessionSchema.pre('save', async function(next) {
    if (this.isNew && !this.roomId) {
        this.roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.joinCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    }
    next();
});

// Check if session is full
sessionSchema.methods.isFull = function() {
    if (this.sessionType === 'one-on-one') {
        return !!this.student;
    }
    return this.enrolledStudents.length >= this.maxStudents;
};

// Add student to session
sessionSchema.methods.addStudent = async function(studentId) {
    if (this.isFull()) {
        throw new Error('Session is full');
    }
    
    if (!this.enrolledStudents.includes(studentId)) {
        this.enrolledStudents.push(studentId);
        await this.save();
    }
};

sessionSchema.methods.closeSession = async function() {
    this.status = 'completed';
    this.isCompleted = true;
    this.updatedAt = new Date();

    // Remove room data completely
    this.roomId = undefined;
    this.joinCode = undefined;
    this.meetingLink = '';

    await this.save();
    return this;
};
module.exports = mongoose.model('Session', sessionSchema);