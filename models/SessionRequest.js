const mongoose = require('mongoose');

const proposedSlotSchema = new mongoose.Schema(
    {
        proposedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        date: {
            type: Date,
            required: true
        },
        startTime: {
            type: String,
            required: true,
            trim: true
        },
        endTime: {
            type: String,
            required: true,
            trim: true
        },
        duration: {
            type: Number,
            required: true,
            min: 30,
            max: 180
        },
        message: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ''
        },
        isWithinAvailability: {
            type: Boolean,
            default: false
        }
    },
    { _id: true, timestamps: true }
);

const sessionRequestSchema = new mongoose.Schema(
    {
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
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
            maxlength: 500,
            default: ''
        },

        currentProposedDate: {
            type: Date,
            required: true,
            index: true
        },
        currentStartTime: {
            type: String,
            required: true,
            trim: true
        },
        currentEndTime: {
            type: String,
            required: true,
            trim: true
        },
        duration: {
            type: Number,
            required: true,
            min: 30,
            max: 180
        },

        proposedCredits: {
            type: Number,
            required: true,
            min: 0
        },

        status: {
            type: String,
            enum: ['pending', 'negotiating', 'confirmed', 'rejected', 'expired', 'cancelled'],
            default: 'pending',
            index: true
        },

        proposedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        lastActionBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },

        cycleCountForDay: {
            type: Number,
            default: 0,
            min: 0,
            max: 2
        },

        negotiationLockedForDay: {
            type: Boolean,
            default: false
        },

        allowedSuggestionMode: {
            type: String,
            enum: ['flexible', 'availability_only'],
            default: 'flexible'
        },

        slotHistory: {
            type: [proposedSlotSchema],
            default: []
        },

        teacherMessage: {
            type: String,
            maxlength: 500,
            default: ''
        },
        studentMessage: {
            type: String,
            maxlength: 500,
            default: ''
        },

        lockExpiresAt: {
            type: Date,
            default: null,
            index: true
        },

        expiresAt: {
            type: Date,
            required: true,
            index: true
        },

        expiredReason: {
            type: String,
            enum: ['', 'manual_expiry', 'slot_passed', 'deadline_passed'],
            default: ''
        },

        session: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Session',
            default: null
        }
    },
    {
        timestamps: true
    }
);

sessionRequestSchema.index(
    { teacher: 1, student: 1, currentProposedDate: 1, currentStartTime: 1, status: 1 },
    { name: 'session_request_lookup_idx' }
);

module.exports = mongoose.model('SessionRequest', sessionRequestSchema);