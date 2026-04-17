const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../config/database');
const SessionSummary = require('../models/SessionSummary');

dotenv.config();
connectDB();

const summaries = [
    {
        session: new mongoose.Types.ObjectId(),
        teacher: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        topicsCovered: ['JavaScript Basics', 'Functions', 'Scope'],
        keyLearnings: ['Understanding closures', 'Execution context'],
        resources: [
            {
                title: 'MDN JavaScript',
                url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
                type: 'article'
            }
        ],
        teacherNotes: 'Good understanding of basics',
        studentNotes: 'Need more practice on closures',
        homework: 'Solve JS problems',
        nextSessionTopics: ['Closures', 'Promises'],
        recordings: [
            {
                url: 'https://example.com/rec1',
                duration: 3600,
                createdAt: new Date()
            }
        ],
        feedback: {
            teacher: {
                rating: 4,
                comment: 'Active student'
            },
            student: {
                rating: 5,
                comment: 'Great explanation'
            }
        }
    },
    {
        session: new mongoose.Types.ObjectId(),
        teacher: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        topicsCovered: ['HTML', 'CSS'],
        keyLearnings: ['Flexbox basics', 'Layout design'],
        resources: [
            {
                title: 'CSS Tricks',
                url: 'https://css-tricks.com/',
                type: 'website'
            }
        ],
        teacherNotes: 'Needs improvement in layouts',
        studentNotes: 'Flexbox confusing',
        homework: 'Create webpage layout',
        nextSessionTopics: ['Grid'],
        recordings: [],
        feedback: {
            teacher: {
                rating: 3,
                comment: 'Average'
            },
            student: {
                rating: 4,
                comment: 'Good session'
            }
        }
    },
    {
        session: new mongoose.Types.ObjectId(),
        teacher: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        topicsCovered: ['Node.js', 'Express'],
        keyLearnings: ['Routing', 'Middleware'],
        resources: [
            {
                title: 'Express Docs',
                url: 'https://expressjs.com/',
                type: 'documentation'
            }
        ],
        teacherNotes: 'Strong backend basics',
        studentNotes: 'Need clarity on middleware',
        homework: 'Build API',
        nextSessionTopics: ['Authentication'],
        recordings: [],
        feedback: {
            teacher: {
                rating: 5,
                comment: 'Excellent'
            },
            student: {
                rating: 5,
                comment: 'Loved it'
            }
        }
    },
    {
        session: new mongoose.Types.ObjectId(),
        teacher: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        topicsCovered: ['MongoDB', 'Mongoose'],
        keyLearnings: ['Schemas', 'CRUD'],
        resources: [
            {
                title: 'MongoDB Docs',
                url: 'https://www.mongodb.com/docs/',
                type: 'documentation'
            }
        ],
        teacherNotes: 'Good DB understanding',
        studentNotes: 'Queries need practice',
        homework: 'CRUD operations',
        nextSessionTopics: ['Aggregation'],
        recordings: [],
        feedback: {
            teacher: {
                rating: 4,
                comment: 'Good'
            },
            student: {
                rating: 4,
                comment: 'Clear'
            }
        }
    },
    {
        session: new mongoose.Types.ObjectId(),
        teacher: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        topicsCovered: ['React', 'Components'],
        keyLearnings: ['Props', 'State'],
        resources: [
            {
                title: 'React Docs',
                url: 'https://react.dev/',
                type: 'documentation'
            }
        ],
        teacherNotes: 'Needs practice in state',
        studentNotes: 'Props clear',
        homework: 'Build React app',
        nextSessionTopics: ['Hooks'],
        recordings: [],
        feedback: {
            teacher: {
                rating: 4,
                comment: 'Progressing'
            },
            student: {
                rating: 5,
                comment: 'Very interactive'
            }
        }
    }
];

const seedSessionSummaries = async () => {
    try {
        await SessionSummary.deleteMany({});
        await SessionSummary.insertMany(summaries);
        console.log('Session summaries seeded successfully');
        process.exit();
    } catch (error) {
        console.error('Error seeding summaries:', error);
        process.exit(1);
    }
};

seedSessionSummaries();