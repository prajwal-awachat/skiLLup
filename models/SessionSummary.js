const mongoose = require('mongoose');

const sessionSummarySchema = new mongoose.Schema({
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true,
        unique: true
    },
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
    topicsCovered: [{
        type: String,
        trim: true
    }],
    keyLearnings: [{
        type: String,
        trim: true
    }],
    resources: [{
        title: String,
        url: String,
        type: String
    }],
    teacherNotes: {
        type: String,
        
    },
    studentNotes: {
        type: String,
        
    },
    homework: {
        type: String,
        maxlength: 1000
    },
  
teacherEdited: {
    type: Boolean,
    default: false
},

hiddenFromTeacher: {
    type: Boolean,
    default: false
},
    recordings: [{
        url: String,
        duration: Number,
        createdAt: Date
    }],
    feedback: {
        teacher: {
            rating: Number,
            comment: String
        },
        student: {
            rating: Number,
            comment: String
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },sentToStudent: {
    type: Boolean,
    default: false
},
sentAt: {
    type: Date
}
});

module.exports = mongoose.model('SessionSummary', sessionSummarySchema);