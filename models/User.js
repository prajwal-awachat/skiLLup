const mongoose = require('mongoose');
const Transaction = require('./Transaction');

const availabilityIntervalSchema = new mongoose.Schema(
    {
        startTime: {
            type: String,
            required: true,
            trim: true
        },
        endTime: {
            type: String,
            required: true,
            trim: true
        }
    },
    { _id: true }
);

const weeklyAvailabilitySchema = new mongoose.Schema(
    {
        monday: {
            type: [availabilityIntervalSchema],
            default: []
        },
        tuesday: {
            type: [availabilityIntervalSchema],
            default: []
        },
        wednesday: {
            type: [availabilityIntervalSchema],
            default: []
        },
        thursday: {
            type: [availabilityIntervalSchema],
            default: []
        },
        friday: {
            type: [availabilityIntervalSchema],
            default: []
        },
        saturday: {
            type: [availabilityIntervalSchema],
            default: []
        },
        sunday: {
            type: [availabilityIntervalSchema],
            default: []
        }
    },
    { _id: false }
);

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    avatar: {
        type: String,
        default: ''
    },

    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },

    bio: {
        type: String,
        maxlength: 500,
        default: ''
    },

    level: {
        type: Number,
        enum: [1, 2, 3, 4, 5],
        default: 1
    },

    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },

    totalReviews: {
        type: Number,
        default: 0
    },

    studentsCount: {
        type: Number,
        default: 0
    },

    credits: {
        type: Number,
        default: 0,
        min: 0
    },

    totalCreditsEarned: {
        type: Number,
        default: 0
    },

    totalCreditsSpent: {
        type: Number,
        default: 0
    },

    redeemableCredits: {
        type: Number,
        default: 0,
        min: 0
    },

    moneyEarned: {
        type: Number,
        default: 0,
        min: 0
    },

    balance: {
        type: Number,
        default: 0,
        min: 0
    },

    customCreditRate: {
        type: Number,
        default: 0,
        min: 0
    },

    earlyExitCount: {
        type: Number,
        default: 0
    },

    isActive: {
        type: Boolean,
        default: true
    },

    timezone: {
        type: String,
        default: 'Asia/Kolkata',
        trim: true
    },

    weeklyAvailability: {
        type: weeklyAvailabilitySchema,
        default: () => ({})
    },

    availabilityEnabled: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

userSchema.methods.getCreditRate = function () {
    if (this.level >= 4 && this.customCreditRate > 0) {
        return this.customCreditRate;
    }

    switch (this.level) {
        case 1: return 1;
        case 2: return 2;
        case 3: return 2;
        case 4: return 3;
        case 5: return 5;
        default: return 1;
    }
};

userSchema.methods.calculateLevelFromRating = function () {
    const avg = Number(this.rating || 0);
    const reviews = Number(this.totalReviews || 0);

    if (reviews < 5) return this.level || 1;

    if (avg < 2.5) return 1;
    if (avg < 3.2) return 2;
    if (avg < 4.0) return 3;
    if (avg < 4.5) return 4;
    return 5;
};

userSchema.methods.canRedeemCredits = function () {
    return this.level >= 3;
};

userSchema.methods.canHaveGroupSessions = function () {
    return this.level >= 5;
};

userSchema.methods.addCredits = async function (amount) {
    this.credits += amount;
    await this.save();

    await Transaction.create({
        user: this._id,
        type: 'credit_purchase',
        amount: amount,
        credits: amount,
        description: `Purchased ${amount} credits`,
        status: 'completed'
    });
};

userSchema.methods.deductCredits = async function (amount, sessionId = null) {
    if (this.credits < amount) {
        throw new Error('Insufficient credits');
    }

    this.credits -= amount;
    this.totalCreditsSpent += amount;
    await this.save();

    await Transaction.create({
        user: this._id,
        type: 'credit_spent',
        amount: amount,
        credits: -amount,
        session: sessionId,
        description: `Spent ${amount} credits`,
        status: 'completed'
    });
};

userSchema.methods.addEarnings = async function (credits, sessionId = null) {
    const creditRate = this.getCreditRate();

    this.credits += credits;
    this.totalCreditsEarned += credits;

    if (this.level >= 3) {
        this.redeemableCredits += credits;
    }

    await this.save();

    await Transaction.create({
        user: this._id,
        type: 'credit_earned',
        amount: credits * creditRate,
        credits: credits,
        session: sessionId,
        description: `Earned ${credits} credits from session`,
        status: 'completed'
    });
};

userSchema.methods.redeemCredits = async function (creditsToRedeem) {
    if (!this.canRedeemCredits()) {
        throw new Error('You cannot redeem credits at your current level');
    }

    if (!creditsToRedeem || creditsToRedeem <= 0) {
        throw new Error('Invalid credit amount');
    }

    if (this.redeemableCredits < creditsToRedeem) {
        throw new Error('Insufficient redeemable credits');
    }

    const moneyValue = creditsToRedeem * 10;

    this.redeemableCredits -= creditsToRedeem;
    this.moneyEarned += moneyValue;
    this.balance += moneyValue;

    await this.save();

    await Transaction.create({
        user: this._id,
        type: 'credit_redeemed',
        amount: moneyValue,
        credits: -creditsToRedeem,
        description: `Redeemed ${creditsToRedeem} credits for ₹${moneyValue}`,
        status: 'completed'
    });

    return moneyValue;
};

module.exports = mongoose.model('User', userSchema);