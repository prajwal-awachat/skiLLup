const express = require('express');
const router = express.Router();

const roadmapController = require('../controllers/roadmapController');
const { protect } = require('../middleware/authMiddleware');

// Generate a new roadmap
// POST /api/roadmap/generate
router.post('/generate', protect, roadmapController.generateRoadmap);

// Get all roadmaps of the logged-in user
// GET /api/roadmap
router.get('/', protect, roadmapController.getUserRoadmaps);

// Get a specific roadmap
// GET /api/roadmap/:id
router.get('/:id', protect, roadmapController.getRoadmapById);

// Toggle milestone completion
// PATCH /api/roadmap/:id/milestone
router.patch('/:id/milestone', protect, roadmapController.toggleMilestone);

// Delete roadmap
// DELETE /api/roadmap/:id
router.delete('/:id', protect, roadmapController.deleteRoadmap);

module.exports = router;