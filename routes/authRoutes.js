const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { body } = require('express-validator');
const { loginRateLimiter, registerRateLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
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

// View routes
router.get('/login', authController.showLoginPage);
router.get('/register', authController.showRegisterPage);

// Register user
router.post(
    '/register',
    registerRateLimiter,
    upload.single('avatar'),
    [
        body('firstName')
            .trim()
            .notEmpty()
            .withMessage('First name is required')
            .isLength({ min: 2 }),
        body('lastName')
            .trim()
            .notEmpty()
            .withMessage('Last name is required')
            .isLength({ min: 2 }),
        body('email')
            .isEmail()
            .withMessage('Please provide a valid email')
            .normalizeEmail(),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters'),
        body('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
    ],
    authController.register
);

// Login user
router.post(
    '/login',
    loginRateLimiter,
    [
        body('email')
            .isEmail()
            .withMessage('Please provide a valid email')
            .normalizeEmail(),
        body('password')
            .notEmpty()
            .withMessage('Password is required')
    ],
    authController.login
);

// Logout
router.get('/logout', authController.logout);

module.exports = router;