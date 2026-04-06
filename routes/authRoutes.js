const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const { authRateLimiter, loginRateLimiter, registerRateLimiter } = require('../middleware/rateLimiter');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
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

// Show login page
router.get('/login', (req, res) => {
    res.render('auth/login', { error: null, success: null, email: null });
});

// Show register page
router.get('/register', (req, res) => {
    res.render('auth/register', { error: null, firstName: null, lastName: null, email: null });
});

// Register user
router.post('/register', 
    registerRateLimiter,
    upload.single('avatar'),
    [
        body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ min: 2 }),
        body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ min: 2 }),
        body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
    ],
    async (req, res) => {
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
            
            // Check if user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.render('auth/register', {
                    error: 'User already exists with this email',
                    firstName,
                    lastName,
                    email
                });
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Handle avatar upload to Cloudinary
            let avatarUrl = null;
            if (req.file) {
                try {
                    // Convert buffer to base64
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
            
            // Create new user (default role is 'user')
            const user = new User({
                firstName,
                lastName,
                name: `${firstName} ${lastName}`,
                email,
                password: hashedPassword,
                role: 'user',
                credits: 50, // Give new users 50 credits
                avatar: avatarUrl
            });
            
            await user.save();
            
            // Generate JWT token
            const token = jwt.sign(
                { id: user._id, email: user.email, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            // Set cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                sameSite: 'strict'
            });
            
            // Redirect based on role
            if (user.role === 'admin') {
                res.redirect('/admin');
            } else {
                res.redirect('/learn');
            }
        } catch (error) {
            console.error('Registration error:', error);
            res.render('auth/register', {
                error: 'Registration failed. Please try again.',
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                email: req.body.email
            });
        }
    }
);

// Login user
router.post('/login',
    loginRateLimiter,
    [
        body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
        body('password').notEmpty().withMessage('Password is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.render('auth/login', {
                    error: errors.array()[0].msg,
                    email: req.body.email
                });
            }
            
            const { email, password, remember } = req.body;
            
            // Find user
            const user = await User.findOne({ email });
            if (!user) {
                return res.render('auth/login', {
                    error: 'Invalid email or password',
                    email
                });
            }
            
            // Check password
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.render('auth/login', {
                    error: 'Invalid email or password',
                    email
                });
            }
            
            // Generate JWT token
            const token = jwt.sign(
                { id: user._id, email: user.email, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: remember ? '30d' : '7d' }
            );
            
            // Set cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
                sameSite: 'strict'
            });
            
            // Redirect based on role
            if (user.role === 'admin') {
                res.redirect('/admin');
            } else {
                res.redirect('/learn');
            }
        } catch (error) {
            console.error('Login error:', error);
            res.render('auth/login', {
                error: 'Login failed. Please try again.',
                email: req.body.email
            });
        }
    }
);

// Logout
router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

module.exports = router;