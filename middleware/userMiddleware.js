const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
    try {
        if (req.cookies.token) {
            const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');
            if (user) {
                req.user = user;
                res.locals.user = user;
            } else {
                res.locals.user = null;
            }
        } else {
            res.locals.user = null;
        }
        next();
    } catch (error) {
        res.locals.user = null;
        next();
    }
};  