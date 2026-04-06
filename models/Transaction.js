const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['credit_purchase', 'credit_spent', 'credit_earned', 'credit_redeemed', 'refund'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        description: 'Monetary amount in INR'
    },
    credits: {
        type: Number,
        required: true,
        description: 'Credit amount (positive or negative)'
    },
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session'
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'upi', 'wallet', 'bank_transfer'],
        default: 'card'
    },
    paymentId: {
        type: String,
        unique: true,
        sparse: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    }
});

module.exports = mongoose.model('Transaction', transactionSchema);