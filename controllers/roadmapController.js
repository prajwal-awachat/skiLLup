const axios = require('axios');
const Roadmap = require('../models/Roadmap');
const roadmapTemplates = require('../utils/roadmapTemplates');

// Render roadmap page
exports.getRoadmapPage = async (req, res) => {
    try {
        // Fetch all roadmaps of the logged-in user
        const roadmaps = await Roadmap.find({
            user: req.user._id
        })
            .sort({ createdAt: -1 })
            .populate('skill');

        res.render('roadmap', {
            user: req.user,
            roadmaps
        });
    } catch (error) {
        console.error('Error loading roadmap page:', error);

        res.render('roadmap', {
            user: req.user,
            roadmaps: []
        });
    }
};

// Generate a new roadmap
exports.generateRoadmap = async (req, res) => {
    try {
        const { goal } = req.body;

        if (!goal || !goal.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Career goal is required.'
            });
        }

        // Call Python Flask ML API
        const mlResponse = await axios.post(
            'http://127.0.0.1:5000/predict',
            {
                goal: goal.trim()
            }
        );

        if (!mlResponse.data.success) {
            return res.status(500).json({
                success: false,
                message: 'ML prediction failed.'
            });
        }

        const predictedCareer = mlResponse.data.career;
        const confidence = mlResponse.data.confidence;

        // Get roadmap template
        const template = roadmapTemplates[predictedCareer];

        if (!template) {
            return res.status(404).json({
                success: false,
                message: `No roadmap template found for "${predictedCareer}".`
            });
        }

        // Convert template milestones into schema-compatible format
        const milestones = template.milestones.map((milestone) => ({
            level: milestone.level,
            title: milestone.title,
            description: milestone.description,
            skills: milestone.skills,
            estimatedDays: milestone.estimatedDays,
            isCompleted: false
        }));

        // Create roadmap document
       const roadmap = new Roadmap({
    user: req.user._id,
    title: template.title,

    // Optional Skill reference
    skill: null,

    // User input and ML prediction
    goal: goal.trim(),
    predictedCareer,
    confidence,

    // Roadmap progress
    currentLevel: 1,
    targetLevel: milestones.length,

    // Template data
    milestones,
    courses: [],
    resources: [],

    // Progress fields
    progress: 0,
    estimatedDays: template.estimatedDays,
    daysSpent: 0,
    isActive: true
});

        // Save to MongoDB
        await roadmap.save();

        // Return response
        res.status(201).json({
            success: true,
            message: 'Roadmap generated successfully.',
            predictedCareer,
            confidence,
            roadmap
        });
    } catch (error) {
        console.error('Error generating roadmap:', error);

        // Flask server not running
        if (error.code === 'ECONNREFUSED') {
            return res.status(500).json({
                success: false,
                message: 'ML service is not running. Start the Flask server first.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to generate roadmap.'
        });
    }
};

// Get a single roadmap
exports.getRoadmapById = async (req, res) => {
    try {
        const roadmap = await Roadmap.findOne({
            _id: req.params.id,
            user: req.user._id
        }).populate('skill');

        if (!roadmap) {
            return res.status(404).json({
                success: false,
                message: 'Roadmap not found.'
            });
        }

        res.json({
            success: true,
            roadmap
        });
    } catch (error) {
        console.error('Error fetching roadmap:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch roadmap.'
        });
    }
};

// Delete a roadmap
exports.deleteRoadmap = async (req, res) => {
    try {
        const roadmap = await Roadmap.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!roadmap) {
            return res.status(404).json({
                success: false,
                message: 'Roadmap not found.'
            });
        }

        res.json({
            success: true,
            message: 'Roadmap deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting roadmap:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to delete roadmap.'
        });
    }
};

// Toggle milestone completion and update progress
exports.toggleMilestone = async (req, res) => {
    try {
        const { milestoneIndex } = req.body;

        const roadmap = await Roadmap.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!roadmap) {
            return res.status(404).json({
                success: false,
                message: 'Roadmap not found.'
            });
        }

        const index = Number(milestoneIndex);

        if (
            Number.isNaN(index) ||
            index < 0 ||
            index >= roadmap.milestones.length
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid milestone index.'
            });
        }

        // Toggle completion
        const milestone = roadmap.milestones[index];
        milestone.isCompleted = !milestone.isCompleted;
        milestone.completedAt = milestone.isCompleted ? new Date() : null;

        // Recalculate progress using your schema method
        roadmap.updateProgress();

        // Update current level
        const completedCount = roadmap.milestones.filter(
            (m) => m.isCompleted
        ).length;

        roadmap.currentLevel = Math.min(
            completedCount + 1,
            roadmap.targetLevel
        );

        roadmap.updatedAt = new Date();

        await roadmap.save();

        res.json({
            success: true,
            message: 'Progress updated successfully.',
            roadmap
        });
    } catch (error) {
        console.error('Error updating roadmap progress:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to update roadmap progress.'
        });
    }
};

// Get all roadmaps of the logged-in user
exports.getUserRoadmaps = async (req, res) => {
    try {
        const roadmaps = await Roadmap.find({
            user: req.user._id
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            roadmaps
        });
    } catch (error) {
        console.error('Error fetching user roadmaps:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to load roadmaps.'
        });
    }
};