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

router.post(
    '/session/:sessionId/upload',
    protect,
    upload.single('recording'),
    recordingController.uploadSessionRecording
);

module.exports = router;