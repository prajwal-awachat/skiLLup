const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const connectDB = require("./config/database");
const http = require('http');
const socketIO = require('socket.io');
const currUser = require("./middleware/userMiddleware");

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const learnRoutes = require('./routes/learnRoutes');
const teacherRoutes = require('./routes/teacherRoutes');

const { globalRateLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const { protect } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIO(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Connect to MongoDB
connectDB()
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// IMPORTANT: Parse URL-encoded bodies and JSON FIRST
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser()); // Parse cookies

// THEN apply security middleware
app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for simplicity (configure properly in production)

// Make user available in all views (if logged in)
app.use(currUser);

// Apply global rate limiting to all routes
app.use(globalRateLimiter);

// Initialize Socket.io
require('./config/socket')(io);
app.set('io', io);

// ============ API ROUTES ============
app.use('/auth', authRoutes);
app.use('/api/learn', learnRoutes);
app.use('/api/teacher', teacherRoutes);


// ============ VIEW ROUTES ============
// Auth page routes (public)
app.get('/auth/login', (req, res) => {
    res.render('auth/login', { error: null, success: null, email: null });
});

app.get('/auth/register', (req, res) => {
    res.render('auth/register', { error: null, firstName: null, lastName: null, email: null });
});

// Public routes (no authentication required)
app.get('/', (req, res) => {
    res.render('index', { user: req.user || null });
});

// ============ PROTECTED VIEW ROUTES ============
// Learn page - this renders the EJS view
app.get('/learn', protect, (req, res) => {
    // Pass user data to the view
    res.render('learn', { 
        user: req.user,
        pendingCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        upcomingSessions: [],
        acceptedSessionRequests: []
    });
});

// Teach page
app.get('/teach', protect, (req, res) => {
    res.render('teach', { user: req.user });
});

// Other protected routes
app.get('/roadmap', protect, (req, res) => {
    res.render('roadmap', { user: req.user });
});

app.get('/history', protect, (req, res) => {
    res.render('history', { user: req.user });
});

app.get('/store', protect, (req, res) => {
    res.render('store', { user: req.user });
});

app.get('/settings', protect, (req, res) => {
    res.render('settings', { user: req.user });
});

// ============ ERROR HANDLERS ============
// 404 Error Handler
app.use((req, res) => {
    res.status(404).render('404', { user: req.user || null });
});

// Global error handler
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Socket.io enabled for real-time features`);
});