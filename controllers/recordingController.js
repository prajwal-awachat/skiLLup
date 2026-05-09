const streamifier = require('streamifier');
const { spawn } = require('child_process');
const path = require('path');

const cloudinary = require('../config/cloudinary');
const Session = require('../models/Session');
const SessionSummary = require('../models/SessionSummary');
const SessionRecording = require('../models/SessionRecording');

exports.uploadSessionRecording = async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No recording uploaded'
            });
        }

        const session = await Session.findById(sessionId)
            .populate('teacher')
            .populate('student');

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, sessionId);

        const recording = await SessionRecording.findOneAndUpdate(
            { session: sessionId },
            {
                session: sessionId,
                cloudinaryUrl: cloudinaryResult.secure_url,
                cloudinaryPublicId: cloudinaryResult.public_id,
                status: 'processing'
            },
            { upsert: true, new: true }
        );

        processRecordingWithPython(session, recording);

        res.json({
            success: true,
            message: 'Recording uploaded. Summary generation started.'
        });

    } catch (error) {
        console.error('Recording upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Recording upload failed'
        });
    }
};

function uploadBufferToCloudinary(buffer, sessionId) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'video',
                folder: 'skillup/session-recordings',
                public_id: `session_${sessionId}_${Date.now()}`
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
}

function processRecordingWithPython(session, recording) {
    const pythonScript = path.join(__dirname, '../ml-service/process_session.py');
    
    SessionRecording.findByIdAndUpdate(
    recording._id,
    {
        status: 'processing'
    }
).catch(console.error);
    const pythonProcess = spawn('python', [
        pythonScript,
        recording.cloudinaryUrl,
        process.env.GEMINI_API_KEY
    ]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    pythonProcess.on('close', async () => {
        try {
            const parsed = JSON.parse(output);

            if (!parsed.success) {
                await markFailed(recording._id, parsed.error || errorOutput);
                return;
            }

           const summary = await SessionSummary.findOneAndUpdate(
    { session: session._id },
    {
        session: session._id,
        teacher: session.teacher._id,
        student: session.student._id,

        topicsCovered: parsed.summary.topicsCovered || [],
        keyLearnings: parsed.summary.keyLearnings || [],
        homework: parsed.summary.homework || '',
        

        teacherNotes: parsed.summary.shortSummary || '',
        studentNotes: parsed.englishTranscript || ''
    },
    { upsert: true, new: true }
);

await Session.findByIdAndUpdate(session._id, {
    summary: summary._id
});

            await SessionRecording.findByIdAndUpdate(recording._id, {
                status: 'completed',
                originalTranscript: parsed.originalTranscript,
                englishTranscript: parsed.englishTranscript,
                processedAt: new Date()
            });

            await cloudinary.uploader.destroy(recording.cloudinaryPublicId, {
                resource_type: 'video'
            });

        } catch (error) {
            console.error('Processing save error:', error);
            console.error('Python error:', errorOutput);
            await markFailed(recording._id, error.message);
        }
    });
}

async function markFailed(recordingId, error) {
    await SessionRecording.findByIdAndUpdate(recordingId, {
        status: 'failed',
        error
    });
}