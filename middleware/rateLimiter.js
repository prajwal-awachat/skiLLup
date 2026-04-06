const rateLimit = require('express-rate-limit');

// Global rate limiter for all routes
exports.globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter rate limiter for auth routes
exports.authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter for login attempts
exports.loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true, // Don't count successful logins
    message: 'Too many login attempts, please try again after 15 minutes',
});

// Rate limiter for registration
exports.registerRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 registrations per hour
    message: 'Too many registration attempts from this IP, please try again after an hour',
});