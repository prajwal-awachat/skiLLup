const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Skill = require('../models/Skill');
const multer = require('multer');
const path = require('path');

// Configure multer for avatar uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/avatars/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, req.user._id + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// GET user skills
router.get('/skills', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('skills', 'name category')
            .populate('teachingSkills', 'name category');
        
        res.json({
            success: true,
            data: {
                learningSkills: user.skills || [],
                teachingSkills: user.teachingSkills || []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST add skill
router.post('/skills', protect, async (req, res) => {
    try {
        const { skillId, type } = req.body;
        const user = await User.findById(req.user._id);
        
        if (type === 'learn') {
            if (!user.skills.includes(skillId)) {
                user.skills.push(skillId);
            }
        } else if (type === 'teach') {
            if (!user.teachingSkills.includes(skillId)) {
                user.teachingSkills.push(skillId);
            }
        }
        
        await user.save();
        res.json({ success: true, message: 'Skill added successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE remove skill
router.delete('/skills/:skillId', protect, async (req, res) => {
    try {
        const { skillId } = req.params;
        const { type } = req.body;
        const user = await User.findById(req.user._id);
        
        if (type === 'learn') {
            user.skills = user.skills.filter(id => id.toString() !== skillId);
        } else if (type === 'teach') {
            user.teachingSkills = user.teachingSkills.filter(id => id.toString() !== skillId);
        }
        
        await user.save();
        res.json({ success: true, message: 'Skill removed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET search skills
router.get('/skills/search', protect, async (req, res) => {
    try {
        const { q } = req.query;
        const skills = await Skill.find({
            name: { $regex: q, $options: 'i' }
        }).limit(20);
        
        res.json({ success: true, data: skills });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT update profile
router.put('/profile', protect, async (req, res) => {
    try {
        const { name, email, bio } = req.body;
        const user = await User.findById(req.user._id);
        
        if (name) user.name = name;
        if (bio) user.bio = bio;
        if (email && email !== user.email) {
            // Check if email is already taken
            const existingUser = await User.findOne({ email });
            if (existingUser && existingUser._id.toString() !== user._id.toString()) {
                return res.status(400).json({ success: false, message: 'Email already in use' });
            }
            user.email = email;
        }
        
        user.updatedAt = Date.now();
        await user.save();
        
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT update password
router.put('/password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);
        
        // Verify current password (you'll need bcrypt comparison)
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }
        
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST upload avatar
router.post('/avatar', protect, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const user = await User.findById(req.user._id);
        user.avatar = `/uploads/avatars/${req.file.filename}`;
        await user.save();
        
        res.json({ success: true, message: 'Avatar updated successfully', data: { avatar: user.avatar } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT update custom rate
router.put('/custom-rate', protect, async (req, res) => {
    try {
        const { customCreditRate } = req.body;
        const user = await User.findById(req.user._id);
        
        if (user.level < 4) {
            return res.status(400).json({ success: false, message: 'You need to be level 4+ to set custom rates' });
        }
        
        user.customCreditRate = customCreditRate;
        await user.save();
        
        res.json({ success: true, message: 'Custom rate updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST redeem credits
router.post('/redeem', protect, async (req, res) => {
    try {
        const { credits } = req.body;
        const user = await User.findById(req.user._id);
        
        const moneyValue = await user.redeemCredits(credits);
        
        res.json({ success: true, message: 'Credits redeemed successfully', data: { amount: moneyValue } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;