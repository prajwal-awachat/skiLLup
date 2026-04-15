const CreditPackage = require('../models/CreditPackage');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Render store page
exports.getStorePage = (req, res) => {
    res.render('store', { user: req.user });
};

// Get all active credit packages
exports.getCreditPackages = async (req, res) => {
    try {
        const packages = await CreditPackage.find({ isActive: true }).sort({ credits: 1 });
        res.json({ success: true, data: packages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Purchase credit package using wallet balance
exports.purchasePackage = async (req, res) => {
    try {
        const { packageId } = req.body;
        const userId = req.user._id;
        
        const creditPackage = await CreditPackage.findById(packageId);
        if (!creditPackage || !creditPackage.isActive) {
            return res.status(404).json({ success: false, message: 'Package not available' });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Check if user has enough balance
        if (user.balance < creditPackage.price) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient balance! Need ₹${creditPackage.price - user.balance} more` 
            });
        }
        
        // Deduct balance and add credits
        user.balance -= creditPackage.price;
        user.credits += creditPackage.credits;
        user.totalCreditsEarned += creditPackage.credits;
        await user.save();
        
        // Create transaction record for purchase
        await Transaction.create({
            user: user._id,
            type: 'credit_purchase',
            amount: -creditPackage.price,
            credits: creditPackage.credits,
            description: `Purchased ${creditPackage.name} (${creditPackage.credits} credits)`,
            status: 'completed'
        });
        
        res.json({ 
            success: true, 
            message: `Successfully purchased ${creditPackage.credits} credits!`,
            data: {
                newBalance: user.balance,
                newCredits: user.credits
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Withdraw credits to wallet balance (1 credit = ₹10)
// Withdraw credits to wallet balance (1 credit = ₹10) with level check
exports.withdrawCredits = async (req, res) => {
    try {
        const { credits } = req.body;
        const userId = req.user._id;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // **LEVEL CHECK - CRITICAL**
        if (user.level === 1 || user.level === 2) {
            return res.status(403).json({ 
                success: false, 
                message: `Withdrawal not available for Level ${user.level}. You need to reach Level 3 to withdraw credits. Complete more teaching sessions to level up!` 
            });
        }
        
        if (user.level < 3) {
            return res.status(403).json({ 
                success: false, 
                message: `Level ${user.level} teachers cannot withdraw credits. Reach Level 3 to unlock withdrawals.` 
            });
        }
        
        // Additional check using model method
        if (!user.canRedeemCredits()) {
            return res.status(403).json({ 
                success: false, 
                message: `Your current level (${user.level}) does not allow withdrawals.` 
            });
        }
        
        // Minimum withdrawal check
        if (credits < 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum withdrawal is 10 credits' 
            });
        }
        
        // Check if user has enough credits
        if (user.credits < credits) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient credits. You have ${user.credits} credits available.` 
            });
        }
        
        // Convert credits to money (1 credit = ₹10)
        const moneyValue = credits * 10;
        
        // Deduct credits and add to balance
        user.credits -= credits;
        user.balance += moneyValue;
        user.redeemableCredits = (user.redeemableCredits || 0) - credits;
        user.moneyEarned = (user.moneyEarned || 0) + moneyValue;
        await user.save();
        
        // Create transaction record
        await Transaction.create({
            user: user._id,
            type: 'credit_withdrawn',
            amount: moneyValue,
            credits: -credits,
            description: `Withdrew ${credits} credits for ₹${moneyValue} (Level ${user.level})`,
            status: 'completed'
        });
        
        res.json({ 
            success: true, 
            message: `Successfully withdrew ${credits} credits! Added ₹${moneyValue} to your wallet.`,
            data: {
                newBalance: user.balance,
                newCredits: user.credits,
                level: user.level
            }
        });
    } catch (error) {
        console.error('Withdraw credits error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ADD THIS NEW FUNCTION
exports.checkWithdrawalEligibility = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        let canWithdraw = false;
        let message = '';
        
        if (user.level === 1) {
            message = `Level 1: Cannot withdraw. Complete 5+ sessions to reach Level 2, then more to reach Level 3.`;
        } else if (user.level === 2) {
            message = `Level 2: Cannot withdraw. Complete more sessions to reach Level 3.`;
        } else if (user.level >= 3) {
            canWithdraw = true;
            message = `Level ${user.level}: You can withdraw credits! Minimum 10 credits. 1 credit = ₹10.`;
        }
        
        res.json({
            success: true,
            data: {
                canWithdraw,
                message,
                currentLevel: user.level,
                credits: user.credits,
                redeemableCredits: user.redeemableCredits || user.credits,
                minWithdrawal: 10
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get user balance and credits
exports.getUserBalance = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({ 
            success: true, 
            data: { 
                credits: user.credits, 
                balance: user.balance || 0,
                redeemableCredits: user.redeemableCredits || 0,
                level: user.level,
                canRedeem: user.canRedeemCredits()
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get user transactions
exports.getUserTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ success: true, data: transactions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};