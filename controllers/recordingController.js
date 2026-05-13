const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cloudinary = require('../config/cloudinary');
const Session = require('../models/Session');
const SessionSummary = require('../models/SessionSummary');
const SessionRecording = require('../models/SessionRecording');
let activePythonProcesses = 0;
const MAX_CONCURRENT_PROCESSES = 1;
const processQueue = [];


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
                console.log(`[${sessionId}] Recording upload started`);
        const cloudinaryResult = await uploadBufferToCloudinary(req.file.buffer, sessionId);
                console.log(`[${sessionId}] Recording uploaded to Cloudinary`);
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
         console.log(`[${sessionId}] Summary generation started`);
        processRecordingWithPython(session, recording);

        res.json({
            success: true,
            message: 'Recording uploaded. Summary generation started.'
        })

    } catch (error) {
        console.error('Recording upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Recording upload failed'
        });
    }
};

exports.uploadSessionChunk = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { chunkIndex, isLastChunk } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No chunk uploaded' });
        }

        // Save chunk to temp folder on disk
        const chunksDir = path.join(os.tmpdir(), `session_chunks_${sessionId}`);
        await fs.promises.mkdir(chunksDir, { recursive: true });

        const chunkPath = path.join(chunksDir, `chunk_${chunkIndex}.webm`);
        await fs.promises.writeFile(chunkPath, req.file.buffer);

        console.log(`[${sessionId}] Chunk ${chunkIndex} saved`);

       // If this is the last chunk, trigger assembly + Cloudinary + AI in background
        if (isLastChunk === 'true') {
            const lockFile = path.join(os.tmpdir(), `assembly_lock_${sessionId}`);
            const alreadyLocked = await fs.promises.access(lockFile).then(() => true).catch(() => false);

            if (alreadyLocked) {
                console.log(`[${sessionId}] Assembly already triggered, skipping duplicate`);
            } else {
                await fs.promises.writeFile(lockFile, '1');
                console.log(`[${sessionId}] Last chunk received — starting assembly`);
                assembleAndProcess(sessionId, chunksDir, lockFile).catch(err => {
                    console.error(`[${sessionId}] Assembly failed:`, err);
                });
            }
        }

        return res.json({ success: true, chunkIndex });
    } catch (error) {
        console.error('Chunk upload error:', error);
        return res.status(500).json({ success: false, message: 'Chunk upload failed' });
    }
};

async function assembleAndProcess(sessionId, chunksDir, lockFile = null) {
    // Read all chunks in order
    const files = (await fs.promises.readdir(chunksDir))
        .filter(f => f.endsWith('.webm'))
        .sort((a, b) => {
            const ai = parseInt(a.replace('chunk_', '').replace('.webm', ''));
            const bi = parseInt(b.replace('chunk_', '').replace('.webm', ''));
            return ai - bi;
        });

    if (files.length === 0) {
        console.error(`[${sessionId}] No chunks found to assemble`);
        return;
    }

    // Concatenate all chunk buffers
    const buffers = await Promise.all(
        files.map(f => fs.promises.readFile(path.join(chunksDir, f)))
    );
    const assembledBuffer = Buffer.concat(buffers);

    console.log(`[${sessionId}] Assembled ${files.length} chunks — ${(assembledBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Clean up chunk files
    await fs.promises.rm(chunksDir, { recursive: true, force: true });

    // Get session
    const session = await Session.findById(sessionId)
        .populate('teacher')
        .populate('student');

    if (!session) {
        console.error(`[${sessionId}] Session not found after assembly`);
        return;
    }

    // Upload assembled buffer to Cloudinary
    const cloudinaryResult = await uploadBufferToCloudinary(assembledBuffer, sessionId);

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

   // Trigger AI summary — fully in background
    processRecordingWithPython(session, recording);

    // Clean up lock file
    if (lockFile) {
        fs.promises.unlink(lockFile).catch(() => {});
    }
}

async function uploadBufferToCloudinary(buffer, sessionId) {
    const tempFilePath = path.join(
        os.tmpdir(),
        `session_${sessionId}_${Date.now()}.webm`
    );

    // Save buffer to temporary file
    await fs.promises.writeFile(tempFilePath, buffer);

    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_large(
            tempFilePath,
            {
                resource_type: 'video',
                folder: 'skillup/session-recordings',
                public_id: `session_${sessionId}_${Date.now()}`,
                chunk_size: 20 * 1024 * 1024, // 20 MB chunks
                timeout: 600000 // 10 minutes
            },
            async (error, result) => {
                // Delete temp file only after Cloudinary has finished using it
                try {
                    await fs.promises.unlink(tempFilePath);
                } catch (unlinkError) {
                    console.error(
                        'Failed to delete temp file:',
                        unlinkError.message
                    );
                }

                if (error) {
                    return reject(error);
                }

                resolve(result);
            }
        );
    });
}

function processRecordingWithPython(session, recording) {
    // Queue management - only process if under limit
    if (activePythonProcesses >= MAX_CONCURRENT_PROCESSES) {
        console.log(`[${session._id}] Queueing processing (${activePythonProcesses} active, ${processQueue.length} queued)`);
        processQueue.push({ session, recording });
        return;
    }
    
    // Increment active process counter
    activePythonProcesses++;
    console.log(`[${session._id}] Starting Python processing (${activePythonProcesses}/${MAX_CONCURRENT_PROCESSES} active)`);
    
    const pythonScript = path.join(__dirname, '../ml-service/process_session.py');
    
    // Update status to processing
    SessionRecording.findByIdAndUpdate(
        recording._id,
        { status: 'processing' }
    ).catch(console.error);
    
    // Spawn Python process
    const pythonProcess = spawn('python', [
        pythonScript,
        recording.cloudinaryUrl
    ]);
    
    console.log(`[${session._id}] Python process started (PID: ${pythonProcess.pid})`);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
        const dataStr = data.toString();
        console.log(`[${session._id}] Python stdout: ${dataStr.trim()}`);
        output += dataStr;
    });
    
    pythonProcess.stderr.on('data', (data) => {
        const dataStr = data.toString();
        console.log(`[${session._id}] Python stderr: ${dataStr.trim()}`);
        errorOutput += dataStr;
    });
    
    pythonProcess.on('error', async (error) => {
        console.error(`[${session._id}] Python process failed to start:`, error);
        await markFailed(recording._id, error.message);
        // Decrement counter and process next in queue
        activePythonProcesses--;
        processNextInQueue();
    });
    
    pythonProcess.on('close', async (code) => {
        console.log(`[${session._id}] Python process exited with code ${code}`);
        
        // Check if output is valid
        if (!output || output.trim() === '') {
            console.error(`[${session._id}] No output from Python process`);
            await markFailed(recording._id, `Python produced no output. Exit code: ${code}. Stderr: ${errorOutput}`);
            // Decrement counter and process next in queue
            activePythonProcesses--;
            processNextInQueue();
            return;
        }
        
        try {
            // Parse JSON output from Python
            const parsed = JSON.parse(output);
            
            if (!parsed.success) {
                console.error(`[${session._id}] Python processing failed:`, parsed.error);
                await markFailed(recording._id, parsed.error || errorOutput);
                // Decrement counter and process next in queue
                activePythonProcesses--;
                processNextInQueue();
                return;
            }
            
            // Save summary to database
            console.log(`[${session._id}] Saving summary to database...`);
            
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
                    studentNotes: parsed.englishTranscript || '',
                    sentToStudent: true,
                    sentAt: new Date()
                },
                { upsert: true, new: true }
            );
            
            // Update session with summary reference
            await Session.findByIdAndUpdate(session._id, {
                summary: summary._id
            });
            
            console.log(`[${session._id}] Summary generated successfully`);
            
            // Update recording status to completed
            await SessionRecording.findByIdAndUpdate(recording._id, {
                status: 'completed',
                originalTranscript: parsed.originalTranscript,
                englishTranscript: parsed.englishTranscript,
                processedAt: new Date()
            });
            
            // Delete video from Cloudinary to save space (optional)
            try {
                await cloudinary.uploader.destroy(recording.cloudinaryPublicId, {
                    resource_type: 'video'
                });
                console.log(`[${session._id}] Cloudinary video deleted`);
            } catch (cloudinaryError) {
                console.warn(`[${session._id}] Failed to delete Cloudinary video:`, cloudinaryError.message);
            }
            
        } catch (error) {
            console.error(`[${session._id}] Processing save error:`, error);
            console.error(`[${session._id}] Python error output:`, errorOutput);
            await markFailed(recording._id, error.message);
        }
        
        // Decrement active process counter
        activePythonProcesses--;
        
        // Process next item in queue
        processNextInQueue();
    });
}

// Helper function to process next queued session
function processNextInQueue() {
    if (processQueue.length > 0 && activePythonProcesses < MAX_CONCURRENT_PROCESSES) {
        const next = processQueue.shift();
        console.log(`Processing next queued session: ${next.session._id} (${processQueue.length} remaining in queue)`);
        processRecordingWithPython(next.session, next.recording);
    }
}

async function markFailed(recordingId, error) {
    console.error(`[${recordingId}] Summary generation failed:`, error);
    try {
        await SessionRecording.findByIdAndUpdate(recordingId, {
            status: 'failed',
            error: error.substring(0, 500) // Limit error length
        });
    } catch (updateError) {
        console.error(`[${recordingId}] Failed to mark as failed:`, updateError);
    }
}