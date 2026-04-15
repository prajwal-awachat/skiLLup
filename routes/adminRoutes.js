const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
    getAllPackages,
    createPackage,
    updatePackage,
    deletePackage
} = require('../controllers/adminController');

// All admin routes require authentication and admin role
router.use(protect);
router.use(adminOnly);

router.get('/packages', getAllPackages);
router.post('/packages', createPackage);
router.put('/packages/:id', updatePackage);
router.delete('/packages/:id', deletePackage);

module.exports = router;