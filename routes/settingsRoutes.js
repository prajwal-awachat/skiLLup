const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('../middleware/authMiddleware');
const settingsController = require('../controllers/settingsController');

// multer memory storage for cloudinary upload
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

router.get('/skills', protect, settingsController.getUserSkills);
router.post('/skills', protect, settingsController.addSkill);
router.delete('/skills/:skillId', protect, settingsController.removeSkill);
router.get('/skills/search', protect, settingsController.searchSkills);

router.put('/profile', protect, settingsController.updateProfile);
router.put('/password', protect, settingsController.updatePassword);

router.post('/avatar', protect, upload.single('avatar'), settingsController.uploadAvatar);

router.put('/custom-rate', protect, settingsController.updateCustomRate);
router.post('/redeem', protect, settingsController.redeemCredits);

module.exports = router;