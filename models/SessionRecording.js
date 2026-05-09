const mongoose = require('mongoose');

const sessionRecordingSchema = new mongoose.Schema({
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true,
        unique: true
    },
    cloudinaryUrl: String,
    cloudinaryPublicId: String,
    originalTranscript: String,
    englishTranscript: String,
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    error: String,
    processedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('SessionRecording', sessionRecordingSchema);