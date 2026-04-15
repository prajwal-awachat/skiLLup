const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const storeController = require('../controllers/storeController');

// View route (renders HTML page)
router.get('/', protect, storeController.getStorePage);

// ==================== API ROUTES ====================
// Package routes
router.get('/packages', protect, storeController.getCreditPackages);
router.post('/purchase', protect, storeController.purchasePackage);

// Withdrawal routes
router.post('/withdraw', protect, storeController.withdrawCredits);
router.get('/withdraw/check', protect, storeController.checkWithdrawalEligibility);

// User data routes
router.get('/balance', protect, storeController.getUserBalance);
router.get('/transactions', protect, storeController.getUserTransactions);

module.exports = router;