const mongoose = require('mongoose');
const Transaction = require('./Transaction');

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
        enum: ['admin','user'],
        default: 'user'
    },
    level: {
        type: Number,
        enum: [1, 2, 3, 4, 5],
        default: 1,
        description: '1: Take sessions only, earn 1 credit/session, cannot redeem | 2: Earn 2 credits/session, cannot redeem | 3: Earn 2 credits/session, can redeem | 4: Set own credit rate, can redeem, one-on-one only | 5: Set own rate, can redeem, group sessions allowed'
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
        description: 'Credits available for cash redemption (for level 3+)'
    },
    moneyEarned: {
        type: Number,
        default: 0,
        description: 'Total money earned from credit redemption'
    },
    skills: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill'
    }],
    teachingSkills: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill'
    }],
    bio: {
        type: String,
        maxlength: 500
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
    customCreditRate: {
        type: Number,
        default: 0,
        description: 'For level 4+ users to set their own rate per session'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Calculate credit rate based on level
userSchema.methods.getCreditRate = function() {
    if (this.level >= 4 && this.customCreditRate > 0) {
        return this.customCreditRate;
    }
    switch(this.level) {
        case 1: return 1;
        case 2: return 2;
        case 3: return 2;
        case 4: return this.customCreditRate || 3;
        case 5: return this.customCreditRate || 5;
        default: return 1;
    }
};

// Check if user can redeem credits
userSchema.methods.canRedeemCredits = function() {
    return this.level >= 3;
};

// Check if user can have group sessions
userSchema.methods.canHaveGroupSessions = function() {
    return this.level >= 5;
};

// Add credits to user
userSchema.methods.addCredits = async function(amount, source) {
    this.credits += amount;
    this.totalCreditsEarned += amount;
    await this.save();
    
    // Create transaction record
    await Transaction.create({
        user: this._id,
        type: 'credit_purchase',
        amount: amount,
        credits: amount,
        description: `Purchased ${amount} credits`,
        status: 'completed'
    });
};

// Deduct credits from user
userSchema.methods.deductCredits = async function(amount, sessionId) {
    if (this.credits < amount) {
        throw new Error('Insufficient credits');
    }
    
    this.credits -= amount;
    this.totalCreditsSpent += amount;
    await this.save();
    
    // Create transaction record
    await Transaction.create({
        user: this._id,
        type: 'credit_spent',
        amount: amount,
        credits: -amount,
        description: `Spent ${amount} credits on session`,
        session: sessionId,
        status: 'completed'
    });
};

// Add earnings to teacher
userSchema.methods.addEarnings = async function(credits, sessionId) {
    const creditRate = this.getCreditRate();
    this.credits += credits;
    this.totalCreditsEarned += credits;
    
    // For level 3+, track redeemable credits
    if (this.level >= 3) {
        this.redeemableCredits += credits;
    }
    
    await this.save();
    
    // Create transaction record
    await Transaction.create({
        user: this._id,
        type: 'credit_earned',
        amount: credits * creditRate,
        credits: credits,
        description: `Earned ${credits} credits from session`,
        session: sessionId,
        status: 'completed'
    });
};

// Redeem credits for money
userSchema.methods.redeemCredits = async function(creditsToRedeem) {
    if (!this.canRedeemCredits()) {
        throw new Error('You cannot redeem credits at your current level');
    }
    
    if (this.redeemableCredits < creditsToRedeem) {
        throw new Error('Insufficient redeemable credits');
    }
    
    const moneyValue = creditsToRedeem * 10; // Assuming 10 INR per credit
    this.redeemableCredits -= creditsToRedeem;
    this.moneyEarned += moneyValue;
    await this.save();
    
    // Create transaction record
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
