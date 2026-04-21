const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
const Skill = require('../models/Skill');
const UserSkill = require('../models/UserSkill');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// GET user skills
exports.getUserSkills = async (req, res) => {
    try {
        const learningSkills = await UserSkill.find({
            user: req.user._id,
            type: 'learn'
        }).populate('skill', 'name category');

        const teachingSkills = await UserSkill.find({
            user: req.user._id,
            type: 'teach'
        }).populate('skill', 'name category');

        res.json({
            success: true,
            data: {
                learningSkills: learningSkills.map(item => ({
                    _id: item.skill._id,
                    name: item.skill.name,
                    category: item.skill.category
                })),
                teachingSkills: teachingSkills.map(item => ({
                    _id: item.skill._id,
                    name: item.skill.name,
                    category: item.skill.category
                }))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// POST add skill
exports.addSkill = async (req, res) => {
    try {
        const { skillId, type } = req.body;

        if (!skillId || !type) {
            return res.status(400).json({
                success: false,
                message: 'Skill ID and type are required'
            });
        }

        if (!['learn', 'teach'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid skill type'
            });
        }

        const skill = await Skill.findById(skillId);
        if (!skill) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }

        const existing = await UserSkill.findOne({
            user: req.user._id,
            skill: skillId,
            type
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Skill already added to ${type === 'learn' ? 'learning' : 'teaching'} list`
            });
        }

        const payload = {
            user: req.user._id,
            skill: skillId,
            type,
            isAvailable: true
        };

        if (type === 'teach') {
            payload.proficiencyLevel = 'intermediate';
            payload.yearsOfExperience = 0;
            payload.hourlyRate = req.user.getCreditRate();
        }

        await UserSkill.create(payload);

        if (type === 'teach') {
            await Skill.findByIdAndUpdate(skillId, {
                $inc: { totalTeachers: 1 }
            });
        } else {
            await Skill.findByIdAndUpdate(skillId, {
                $inc: { totalLearners: 1 }
            });
        }

        res.json({
            success: true,
            message: 'Skill added successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// DELETE remove skill
exports.removeSkill = async (req, res) => {
    try {
        const { skillId } = req.params;
        const { type } = req.body;

        if (!skillId || !type) {
            return res.status(400).json({
                success: false,
                message: 'Skill ID and type are required'
            });
        }

        if (!['learn', 'teach'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid skill type'
            });
        }

        const deleted = await UserSkill.findOneAndDelete({
            user: req.user._id,
            skill: skillId,
            type
        });

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Skill not found'
            });
        }

        if (type === 'teach') {
            await Skill.findByIdAndUpdate(skillId, {
                $inc: { totalTeachers: -1 }
            });
        } else {
            await Skill.findByIdAndUpdate(skillId, {
                $inc: { totalLearners: -1 }
            });
        }

        res.json({
            success: true,
            message: 'Skill removed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// GET search skills
exports.searchSkills = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();

        if (!q) {
            return res.json({
                success: true,
                data: []
            });
        }

        const skills = await Skill.find({
            isActive: true,
            name: { $regex: q, $options: 'i' }
        })
        .select('name category')
        .limit(20);

        res.json({
            success: true,
            data: skills
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// PUT update profile
exports.updateProfile = async (req, res) => {
    try {
        const { name, email, bio } = req.body;
        const user = await User.findById(req.user._id);

        if (name !== undefined) user.name = name.trim();
        if (bio !== undefined) user.bio = bio;

        if (email !== undefined && email !== user.email) {
            const normalizedEmail = email.trim().toLowerCase();

            const existingUser = await User.findOne({ email: normalizedEmail });
            if (existingUser && existingUser._id.toString() !== user._id.toString()) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use'
                });
            }

            user.email = normalizedEmail;
        }

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// PUT update password
exports.updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id).select('+password');

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// POST upload avatar
exports.uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'skill-exchange/avatars',
            width: 150,
            height: 150,
            crop: 'fill'
        });

        const user = await User.findById(req.user._id);
        user.avatar = result.secure_url;
        await user.save();

        res.json({
            success: true,
            message: 'Avatar updated successfully',
            data: {
                avatar: user.avatar
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// PUT update custom rate
exports.updateCustomRate = async (req, res) => {
    try {
        const { customCreditRate } = req.body;
        const user = await User.findById(req.user._id);

        if (user.level < 4) {
            return res.status(400).json({
                success: false,
                message: 'You need to be level 4+ to set custom rates'
            });
        }

        if (!customCreditRate || Number(customCreditRate) < 1) {
            return res.status(400).json({
                success: false,
                message: 'Custom rate must be at least 1'
            });
        }

        user.customCreditRate = Number(customCreditRate);
        await user.save();

        await UserSkill.updateMany(
            { user: req.user._id, type: 'teach' },
            { hourlyRate: Number(customCreditRate) }
        );

        res.json({
            success: true,
            message: 'Custom rate updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// POST redeem credits
exports.redeemCredits = async (req, res) => {
    try {
        const { credits } = req.body;
        const user = await User.findById(req.user._id);

        const moneyValue = await user.redeemCredits(Number(credits));

        res.json({
            success: true,
            message: 'Credits redeemed successfully',
            data: {
                amount: moneyValue,
                balance: user.balance
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};