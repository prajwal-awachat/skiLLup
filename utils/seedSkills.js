const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Skill = require('../models/Skill');
const connectDB = require('../config/database');

dotenv.config();
connectDB();

const skills = [
    // Programming
    { name: 'JavaScript', category: 'Programming', description: 'Modern JavaScript programming' },
    { name: 'Python', category: 'Programming', description: 'Python programming language' },
    { name: 'Java', category: 'Programming', description: 'Java programming' },
    { name: 'React', category: 'Programming', description: 'React.js library' },
    { name: 'Node.js', category: 'Programming', description: 'Node.js runtime' },
    
    // Design
    { name: 'UI/UX Design', category: 'Design', description: 'User interface and experience design' },
    { name: 'Graphic Design', category: 'Design', description: 'Visual communication design' },
    { name: 'Figma', category: 'Design', description: 'Figma design tool' },
    { name: 'Photoshop', category: 'Design', description: 'Adobe Photoshop' },
    
    // Music
    { name: 'Guitar', category: 'Music', description: 'Acoustic/Electric guitar' },
    { name: 'Piano', category: 'Music', description: 'Piano/keyboard' },
    { name: 'Music Production', category: 'Music', description: 'Digital music production' },
    
    // Language
    { name: 'English', category: 'Language', description: 'English language' },
    { name: 'Spanish', category: 'Language', description: 'Spanish language' },
    { name: 'French', category: 'Language', description: 'French language' },
    
    // Business
    { name: 'Digital Marketing', category: 'Business', description: 'Online marketing strategies' },
    { name: 'Entrepreneurship', category: 'Business', description: 'Startup and business skills' },
    { name: 'Public Speaking', category: 'Business', description: 'Effective communication' },
    
    // Photography
    { name: 'Photography Basics', category: 'Photography', description: 'Fundamentals of photography' },
    { name: 'Video Editing', category: 'Photography', description: 'Video post-production' },
    
    // Cooking
    { name: 'Baking', category: 'Cooking', description: 'Baking techniques' },
    { name: 'International Cuisine', category: 'Cooking', description: 'World cuisine cooking' },
    
    // Sports
    { name: 'Yoga', category: 'Sports', description: 'Yoga and meditation' },
    { name: 'Fitness Training', category: 'Sports', description: 'Personal fitness coaching' },
    
    // Other
    { name: 'Life Coaching', category: 'Other', description: 'Personal development coaching' },
    { name: 'Career Counseling', category: 'Other', description: 'Professional guidance' }
];

const seedSkills = async () => {
    try {
        await Skill.deleteMany({});
        await Skill.insertMany(skills);
        console.log('Skills seeded successfully');
        process.exit();
    } catch (error) {
        console.error('Error seeding skills:', error);
        process.exit(1);
    }
};

seedSkills();