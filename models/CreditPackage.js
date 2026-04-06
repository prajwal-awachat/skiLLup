const mongoose = require('mongoose');

const creditPackageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    credits: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    originalPrice: {
        type: Number,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    features: [{
        type: String
    }],
    validityDays: {
        type: Number,
        default: 30
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isPopular: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('CreditPackage', creditPackageSchema);