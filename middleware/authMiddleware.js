const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - authentication middleware
exports.protect = async (req, res, next) => {
    let token;
    
    // Check for token in cookies
    if (req.cookies.token) {
        token = req.cookies.token;
    }
    
    // Check for token in Authorization header (Bearer token)
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    
    // Check if token exists
    if (!token) {
        // For API requests
        if (req.xhr || req.headers.accept === 'application/json') {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }
        // For web requests
        return res.redirect('/auth/login');
    }
    
    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            if (req.xhr || req.headers.accept === 'application/json') {
                return res.status(401).json({
                    success: false,
                    message: 'User no longer exists'
                });
            }
            res.clearCookie('token');
            return res.redirect('/auth/login');
        }
        
        // Check if user is active
        if (!user.isActive) {
            if (req.xhr || req.headers.accept === 'application/json') {
                return res.status(401).json({
                    success: false,
                    message: 'Your account has been deactivated'
                });
            }
            res.clearCookie('token');
            return res.redirect('/auth/login?error=account_deactivated');
        }
        
        // Attach user to request object
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        
        // Clear invalid token
        res.clearCookie('token');
        
        if (error.name === 'JsonWebTokenError') {
            if (req.xhr || req.headers.accept === 'application/json') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token'
                });
            }
            return res.redirect('/auth/login?error=invalid_token');
        }
        
        if (error.name === 'TokenExpiredError') {
            if (req.xhr || req.headers.accept === 'application/json') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired'
                });
            }
            return res.redirect('/auth/login?error=token_expired');
        }
        
        if (req.xhr || req.headers.accept === 'application/json') {
            return res.status(401).json({
                success: false,
                message: 'Not authorized'
            });
        }
        return res.redirect('/auth/login');
    }
};

// Role-based access control middleware
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            if (req.xhr || req.headers.accept === 'application/json') {
                return res.status(401).json({
                    success: false,
                    message: 'Not authenticated'
                });
            }
            return res.redirect('/auth/login');
        }
        
        if (!roles.includes(req.user.role)) {
            // For API requests
            if (req.xhr || req.headers.accept === 'application/json') {
                return res.status(403).json({
                    success: false,
                    message: `Role '${req.user.role}' is not authorized to access this resource`,
                    requiredRoles: roles
                });
            }
            
            // For web requests - render 403 page
            return res.status(403).render('auth/403', { 
                user: req.user,
                message: `You do not have permission to access this page. Required role: ${roles.join(' or ')}`,
                requiredRoles: roles,
                currentRole: req.user.role
            });
        }
        
        next();
    };
};

// Check if user is admin (shorthand for restrictTo('admin'))
exports.isAdmin = (req, res, next) => {
    if (!req.user) {
        if (req.xhr || req.headers.accept === 'application/json') {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }
        return res.redirect('/auth/login');
    }
    
    if (req.user.role !== 'admin') {
        if (req.xhr || req.headers.accept === 'application/json') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
        return res.status(403).render('auth/403', { 
            user: req.user,
            message: 'Admin access required to view this page'
        });
    }
    
    next();
};

// Optional authentication - doesn't require token but attaches user if present
exports.optionalAuth = async (req, res, next) => {
    let token;
    
    if (req.cookies.token) {
        token = req.cookies.token;
    }
    
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');
            if (user && user.isActive) {
                req.user = user;
            }
        } catch (error) {
            // Silent fail for optional auth
            console.error('Optional auth error:', error.message);
        }
    }
    
    next();
};

exports.adminOnly = exports.isAdmin;

