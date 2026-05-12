const express = require('express');
const router = express.Router();
const multer = require('multer');

const { protect } = require('../middleware/authMiddleware');
const recordingController = require('../controllers/recordingController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500 * 1024 * 1024
    }
});

// Apply long timeout only for recording upload route
router.use('/session/:sessionId/upload', (req, res, next) => {
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    next();
});

router.post(
    '/session/:sessionId/upload',
    protect,
    upload.single('recording'),
    recordingController.uploadSessionRecording
);

router.post(
    '/session/:sessionId/chunk',
    protect,
    upload.single('chunk'),
    recordingController.uploadSessionChunk
);

module.exports = router;