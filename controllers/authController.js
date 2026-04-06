const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const BlacklistToken = require('../models/BlacklistToken');

// Helper function to generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
    });
};

// Send token via cookie
const sendTokenResponse = (user, statusCode, res, message) => {
    const token = generateToken(user._id);
    
    const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    };
    
    res.cookie('token', token, cookieOptions);
    
    // Remove password from output
    user.password = undefined;
    
    res.status(statusCode).json({
        success: true,
        message,
        token,
        user
    });
};

// @desc    Register user
// @route   POST /auth/register
// @access  Public
exports.register = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: role || 'learner'
        });
        
        sendTokenResponse(user, 201, res, 'User registered successfully');
        
    } catch (error) {
        next(error);
    }
};

// @desc    Login user
// @route   POST /auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        
        // Validate email & password
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }
        
        // Check for user
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Your account has been deactivated'
            });
        }
        
        // Check password
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        sendTokenResponse(user, 200, res, 'Login successful');
        
    } catch (error) {
        next(error);
    }
};

// @desc    Logout user
// @route   POST /auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        
        if (token) {
            // Add token to blacklist
            await BlacklistToken.create({ token });
        }
        
        // Clear cookie
        res.cookie('token', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true
        });
        
        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Get current logged in user
// @route   GET /auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('skills')
            .populate('teachingSkills');
        
        res.status(200).json({
            success: true,
            user
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Update user details
// @route   PUT /auth/updatedetails
// @access  Private
exports.updateDetails = async (req, res, next) => {
    try {
        const fieldsToUpdate = {
            name: req.body.name,
            bio: req.body.bio,
            avatar: req.body.avatar
        };
        
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

// @desc    Update password
// @route   PUT /auth/updatepassword
// @access  Private
exports.updatePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user.id).select('+password');
        
        // Check current password
        const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        
        sendTokenResponse(user, 200, res, 'Password updated successfully');
        
    } catch (error) {
        next(error);
    }
};