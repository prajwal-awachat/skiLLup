const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const BlacklistToken = require('../models/BlacklistToken');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const generateToken = (payload, expiresIn = '7d') => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// Show login page
exports.showLoginPage = (req, res) => {
    res.render('auth/login', { error: null, success: null, email: null });
};

// Show register page
exports.showRegisterPage = (req, res) => {
    res.render('auth/register', {
        error: null,
        firstName: null,
        lastName: null,
        email: null
    });
};

// Register user
exports.register = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.render('auth/register', {
                error: errors.array()[0].msg,
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                email: req.body.email
            });
        }

        const { firstName, lastName, email, password } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('auth/register', {
                error: 'User already exists with this email',
                firstName,
                lastName,
                email
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        let avatarUrl = '';
        if (req.file) {
            try {
                const b64 = Buffer.from(req.file.buffer).toString('base64');
                const dataURI = `data:${req.file.mimetype};base64,${b64}`;

                const result = await cloudinary.uploader.upload(dataURI, {
                    folder: 'skill-exchange/avatars',
                    width: 150,
                    height: 150,
                    crop: 'fill'
                });

                avatarUrl = result.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary upload error:', uploadError);
            }
        }

        const user = new User({
            name: `${firstName} ${lastName}`,
            email,
            password: hashedPassword,
            role: 'user',
            credits: 50,
            avatar: avatarUrl
        });

        await user.save();

        const token = generateToken(
            { id: user._id, email: user.email, role: user.role },
            '7d'
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: 'strict'
        });

        res.redirect('/learn');
    } catch (error) {
        console.error('Registration error:', error);
        res.render('auth/register', {
            error: 'Registration failed. Please try again.',
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.email
        });
    }
};

// Login user
exports.login = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.render('auth/login', {
                error: errors.array()[0].msg,
                email: req.body.email
            });
        }

        const { email, password, remember } = req.body;

        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.render('auth/login', {
                error: 'Invalid email or password',
                email
            });
        }

        if (!user.isActive) {
            return res.render('auth/login', {
                error: 'Your account is deactivated',
                email
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.render('auth/login', {
                error: 'Invalid email or password',
                email
            });
        }

        const token = generateToken(
            { id: user._id, email: user.email, role: user.role },
            remember ? '30d' : '7d'
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
            sameSite: 'strict'
        });

        res.redirect('/learn');
    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', {
            error: 'Login failed. Please try again.',
            email: req.body.email
        });
    }
};

// Logout user
exports.logout = async (req, res) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

        if (token) {
            await BlacklistToken.create({ token });
        }

        res.clearCookie('token');
        res.redirect('/');
    } catch (error) {
        console.error('Logout error:', error);
        res.clearCookie('token');
        res.redirect('/');
    }
};

// Optional API helpers if used later
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        next(error);
    }
};

exports.updateDetails = async (req, res, next) => {
    try {
        const fieldsToUpdate = {};

        if (req.body.name !== undefined) fieldsToUpdate.name = req.body.name;
        if (req.body.bio !== undefined) fieldsToUpdate.bio = req.body.bio;
        if (req.body.avatar !== undefined) fieldsToUpdate.avatar = req.body.avatar;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            fieldsToUpdate,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            message: 'User details updated successfully',
            user
        });
    } catch (error) {
        next(error);
    }
};

exports.updatePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.user.id).select('+password');

        const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        next(error);
    }
};