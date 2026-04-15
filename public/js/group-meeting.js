// public/js/group-meeting.js
let socket;
let localStream;
let screenStream = null;
let peerConnections = new Map(); // Map of userId -> RTCPeerConnection
let participants = new Map(); // Map of userId -> {name, stream}
let roomId;
let isScreenSharing = false;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

async function init() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Socket connected');
        socket.emit('register_user', currentUser.id);
        socket.emit('join-group-meeting', {
            roomId: sessionData.roomId,
            userId: currentUser.id,
            userName: currentUser.name
        });
    });
    
    // Get local media
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
        updateConnectionStatus('Connected!');
        
        // Setup peer connection for existing participants
        setupSocketListeners();
    } catch (error) {
        console.error('Media error:', error);
        updateConnectionStatus('Cannot access camera/microphone', true);
    }
    
    setupControls();
}

function setupSocketListeners() {
    // New user joined
    socket.on('user-joined-group', async ({ userId, userName, userCount }) => {
        console.log(`${userName} joined`);
        updateParticipantCount(userCount);
        addParticipantToList(userId, userName);
        
        // Create peer connection for this user
        if (userId !== currentUser.id) {
            await createPeerConnection(userId, userName);
            createAndSendOffer(userId);
        }
    });
    
    // User left
    socket.on('user-left-group', ({ userId, userName }) => {
        console.log(`${userName} left`);
        removeParticipant(userId);
        closePeerConnection(userId);
    });
    
    // WebRTC Signaling
    socket.on('group-offer', async ({ offer, from, fromName }) => {
        if (from !== currentUser.id) {
            await createPeerConnection(from, fromName);
            await peerConnections.get(from).setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnections.get(from).createAnswer();
            await peerConnections.get(from).setLocalDescription(answer);
            socket.emit('group-answer', {
                answer,
                roomId: sessionData.roomId,
                targetUserId: from
            });
        }
    });
    
    socket.on('group-answer', async ({ answer, from }) => {
        if (peerConnections.has(from)) {
            await peerConnections.get(from).setRemoteDescription(new RTCSessionDescription(answer));
        }
    });
    
    socket.on('group-ice-candidate', async ({ candidate, from }) => {
        if (peerConnections.has(from)) {
            await peerConnections.get(from).addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
    
    // Group chat
    socket.on('group-chat-message', ({ message, userName, timestamp }) => {
        addChatMessage(message, userName, false, timestamp);
    });
}

async function createPeerConnection(userId, userName) {
    const pc = new RTCPeerConnection(configuration);
    
    // Add local tracks
    const currentStream = isScreenSharing && screenStream ? screenStream : localStream;
    currentStream.getTracks().forEach(track => {
        pc.addTrack(track, currentStream);
    });
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('group-ice-candidate', {
                candidate: event.candidate,
                roomId: sessionData.roomId,
                targetUserId: userId
            });
        }
    };
    
    // Handle remote stream
    pc.ontrack = (event) => {
        console.log(`Received track from ${userName}`);
        displayRemoteVideo(userId, userName, event.streams[0]);
    };
    
    // Handle connection state
    pc.onconnectionstatechange = () => {
        console.log(`Connection with ${userName}: ${pc.connectionState}`);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            removeParticipant(userId);
            closePeerConnection(userId);
        }
    };
    
    peerConnections.set(userId, pc);
    return pc;
}

async function createAndSendOffer(userId) {
    const pc = peerConnections.get(userId);
    if (pc) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('group-offer', {
            offer,
            roomId: sessionData.roomId,
            targetUserId: userId
        });
    }
}

function displayRemoteVideo(userId, userName, stream) {
    const remoteVideosDiv = document.getElementById('remoteVideos');
    
    let videoContainer = document.getElementById(`remote_${userId}`);
    if (!videoContainer) {
        videoContainer = document.createElement('div');
        videoContainer.id = `remote_${userId}`;
        videoContainer.className = 'remote-video-container';
        videoContainer.innerHTML = `
            <video id="video_${userId}" autoplay playsinline></video>
            <div class="participant-name">${escapeHtml(userName)}</div>
        `;
        remoteVideosDiv.appendChild(videoContainer);
    }
    
    const video = document.getElementById(`video_${userId}`);
    if (video && video.srcObject !== stream) {
        video.srcObject = stream;
    }
}

function removeParticipant(userId) {
    const container = document.getElementById(`remote_${userId}`);
    if (container) container.remove();
    
    const participantItems = document.querySelectorAll(`.participant-item[data-user-id="${userId}"]`);
    participantItems.forEach(item => item.remove());
}

function closePeerConnection(userId) {
    const pc = peerConnections.get(userId);
    if (pc) {
        pc.close();
        peerConnections.delete(userId);
    }
}

function addParticipantToList(userId, userName) {
    const list = document.getElementById('participantsList');
    const existing = document.querySelector(`.participant-item[data-user-id="${userId}"]`);
    if (!existing && userId !== currentUser.id) {
        const item = document.createElement('div');
        item.className = 'participant-item';
        item.setAttribute('data-user-id', userId);
        item.innerHTML = `
            <span class="online-dot"></span>
            <span>${escapeHtml(userName)}</span>
        `;
        list.appendChild(item);
    }
}

function updateParticipantCount(count) {
    document.getElementById('participantCount').textContent = count;
    document.getElementById('participantBadge').textContent = count;
}

async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const videoTrack = screenStream.getVideoTracks()[0];
            
            videoTrack.onended = () => {
                stopScreenShare();
            };
            
            // Replace video track for all peers
            for (const [userId, pc] of peerConnections) {
                const senders = pc.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(videoTrack);
                }
            }
            
            // Also update local video preview
            document.getElementById('localVideo').srcObject = screenStream;
            isScreenSharing = true;
            document.getElementById('screenShareBtn').classList.add('active');
            showToast('Screen sharing started', 'success');
        } catch (error) {
            console.error('Screen share error:', error);
            showToast('Failed to share screen', 'error');
        }
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    // Switch back to camera
    for (const [userId, pc] of peerConnections) {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender && localStream) {
            const cameraTrack = localStream.getVideoTracks()[0];
            videoSender.replaceTrack(cameraTrack);
        }
    }
    
    document.getElementById('localVideo').srcObject = localStream;
    isScreenSharing = false;
    document.getElementById('screenShareBtn').classList.remove('active');
    showToast('Screen sharing stopped', 'info');
}

function toggleAudio() {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const btn = document.getElementById('toggleMicBtn');
        btn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
        btn.style.backgroundColor = audioTrack.enabled ? '' : '#dc2626';
    }
}

function toggleVideo() {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const btn = document.getElementById('toggleVideoBtn');
        btn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
        btn.style.backgroundColor = videoTrack.enabled ? '' : '#dc2626';
    }
}

function setupChat() {
    const toggleChatBtn = document.getElementById('toggleChatBtn');
    const chatSidebar = document.getElementById('chatSidebar');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatInput = document.getElementById('meetingChatInput');
    const sendBtn = document.getElementById('sendMeetingChatBtn');
    
    toggleChatBtn.addEventListener('click', () => {
        chatSidebar.style.display = chatSidebar.style.display === 'none' ? 'flex' : 'none';
    });
    
    closeChatBtn.addEventListener('click', () => {
        chatSidebar.style.display = 'none';
    });
    
    const sendMessage = () => {
        const message = chatInput.value.trim();
        if (!message) return;
        
        socket.emit('group-chat-message', {
            roomId: sessionData.roomId,
            message: message,
            userName: currentUser.name
        });
        
        addChatMessage(message, currentUser.name, true, new Date());
        chatInput.value = '';
    };
    
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function addChatMessage(message, userName, isSent, timestamp) {
    const container = document.getElementById('meetingChatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isSent ? 'sent' : 'received'}`;
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-bubble">
            ${!isSent ? `<div class="message-sender">${escapeHtml(userName)}</div>` : ''}
            <div class="message-content">${escapeHtml(message)}</div>
            <div class="message-time">${time}</div>
        </div>
    `;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

function setupControls() {
    document.getElementById('toggleMicBtn').addEventListener('click', toggleAudio);
    document.getElementById('toggleVideoBtn').addEventListener('click', toggleVideo);
    document.getElementById('screenShareBtn').addEventListener('click', toggleScreenShare);
    document.getElementById('toggleParticipantsBtn').addEventListener('click', () => {
        document.getElementById('participantsList').classList.toggle('active');
    });
    
    document.getElementById('endCallBtn').addEventListener('click', () => {
        endCall();
    });
    
    setupChat();
}

function updateConnectionStatus(message, isError = false) {
    const statusDiv = document.getElementById('connectionStatus');
    statusDiv.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-spinner fa-pulse'}"></i> ${message}`;
    if (isError) {
        statusDiv.style.background = '#fee2e2';
        statusDiv.style.color = '#dc2626';
    }
    setTimeout(() => {
        if (!isError) statusDiv.style.display = 'none';
    }, 3000);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }, 100);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function endCall() {
    // Close all peer connections
    for (const [userId, pc] of peerConnections) {
        pc.close();
    }
    peerConnections.clear();
    
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    
    socket.emit('leave-group-meeting', {
        roomId: sessionData.roomId,
        userId: currentUser.id,
        userName: currentUser.name
    });
    
    window.location.href = isTeacher ? '/teach' : '/learn';
}

// Initialize
init();