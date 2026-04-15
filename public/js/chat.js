// public/js/chat.js
// ============================================
// SHARED CHAT MODULE - Complete Working Version
// ============================================

class ChatModule {
    constructor(socket, currentUser, options = {}) {
        this.socket = socket;
        this.currentUser = currentUser;
        this.apiBase = options.apiBase || '/api/learn';
        this.currentConversationId = null;
        this.currentChatUser = null;
        this.onMessageReceived = options.onMessageReceived || null;
        
        console.log('ChatModule initialized with user:', currentUser?.name);
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupSocketEvents();
    }
    
    setupEventListeners() {
        // Send message on button click
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn) {
            // Remove old listener to avoid duplicates
            const newSendBtn = sendBtn.cloneNode(true);
            sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
            newSendBtn.addEventListener('click', () => this.sendMessage());
        }
        
        // Send message on Enter key
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            const newInput = chatInput.cloneNode(true);
            chatInput.parentNode.replaceChild(newInput, chatInput);
            newInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
        
        // Close modal
        const closeBtn = document.getElementById('closeChatModalBtn');
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', () => this.closeChat());
        }
        
        // Close on outside click
        const modal = document.getElementById('chatModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeChat();
            });
        }
    }
    
    setupSocketEvents() {
        if (!this.socket) {
            console.warn('Socket not available');
            return;
        }
        
        this.socket.on('new_message', (data) => {
            console.log('New message event received:', data);
            const currentConvId = this.currentConversationId ? this.currentConversationId.toString() : null;
            const receivedConvId = data.conversationId ? data.conversationId.toString() : null;
            
            if (currentConvId && receivedConvId && currentConvId === receivedConvId) {
                this.addMessageToUI(data.message);
            }
        });
        
        this.socket.on('message_deleted', (data) => {
            const messageElement = document.querySelector(`.chat-message[data-message-id="${data.messageId}"]`);
            if (messageElement) {
                messageElement.remove();
                this.showToast('Message was deleted', 'info');
            }
        });
    }
    
    async openChat(user, userType = 'student') {
        // Prevent chatting with yourself
        if (user.id === this.currentUser.id) {
            this.showToast('You cannot chat with yourself', 'error');
            return;
        }
        
        this.currentChatUser = user;
        
        // Show loading state
        const modal = document.getElementById('chatModal');
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="chat-message system"><div class="message-bubble"><i class="fas fa-spinner fa-pulse"></i> Loading chat...</div></div>';
        }
        
        // Check if chat is allowed
        try {
            const endpoint = `${this.apiBase}/chat/check/${user.id}`;
            console.log('Checking chat access:', endpoint);
            
            const response = await fetch(endpoint);
            const data = await response.json();
            
            console.log('Chat check response:', data);
            
            if (!data.success || !data.data?.canChat) {
                this.showToast(data.data?.message || 'You can only chat with users you have an accepted session with', 'error');
                return;
            }
            
            // Get or create conversation
            const convResponse = await fetch(`${this.apiBase}/chat/conversation/${user.id}`);
            const convData = await convResponse.json();
            
            console.log('Conversation response:', convData);
            
            if (convData.success) {
                this.currentConversationId = convData.data.conversation._id;
                this.renderMessages(convData.data.messages || [], user.name);
                
                // Update modal title
                const userNameSpan = document.getElementById('chatUserName');
                if (userNameSpan) userNameSpan.textContent = user.name;
                
                // Show modal
                if (modal) modal.classList.add('show');
                
                // Join socket room
                if (this.socket && this.currentConversationId) {
                    this.socket.emit('join_conversation', this.currentConversationId.toString());
                }
                
                // Focus input
                const chatInput = document.getElementById('chatInput');
                if (chatInput) setTimeout(() => chatInput.focus(), 300);
            } else {
                this.showToast(convData.message || 'Failed to load conversation', 'error');
            }
        } catch (error) {
            console.error('Error opening chat:', error);
            this.showToast('Failed to load chat', 'error');
        }
    }
    
    renderMessages(messages, otherUserName) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        if (!messages || messages.length === 0) {
            container.innerHTML = `<div class="chat-message system">
                <div class="message-bubble"><i class="fas fa-comment"></i> Start chatting with ${this.escapeHtml(otherUserName || 'the user')}!</div>
            </div>`;
            return;
        }
        
        container.innerHTML = messages.map(msg => {
            const isCurrentUser = msg.sender && msg.sender._id.toString() === this.currentUser.id.toString();
            const senderName = msg.sender ? this.escapeHtml(msg.sender.name) : 'Unknown';
            const content = this.escapeHtml(msg.content);
            const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const messageId = msg._id;
            
            const messageClass = isCurrentUser ? 'sent' : 'received';
            
            const deleteButton = isCurrentUser ? `
                <div class="message-actions">
                    <button class="delete-message-btn" onclick="if(window.chatModule) window.chatModule.deleteMessage('${messageId}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : '';
            
            return `
                <div class="chat-message ${messageClass}" data-message-id="${messageId}">
                    <div class="message-bubble">
                        ${!isCurrentUser ? `<div class="message-sender">${senderName}</div>` : ''}
                        <div class="message-content">${content}</div>
                        <div class="message-time">${time}</div>
                        ${deleteButton}
                    </div>
                </div>
            `;
        }).join('');
        
        container.scrollTop = container.scrollHeight;
    }
    
    addMessageToUI(message) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        // Don't duplicate if already added
        if (document.querySelector(`.chat-message[data-message-id="${message._id}"]`)) {
            return;
        }
        
        const isCurrentUser = message.sender && message.sender._id.toString() === this.currentUser.id.toString();
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isCurrentUser ? 'sent' : 'received'}`;
        messageDiv.setAttribute('data-message-id', message._id);
        
        const deleteButton = isCurrentUser ? `
            <div class="message-actions">
                <button class="delete-message-btn" onclick="if(window.chatModule) window.chatModule.deleteMessage('${message._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        ` : '';
        
        messageDiv.innerHTML = `
            <div class="message-bubble">
                ${!isCurrentUser ? `<div class="message-sender">${this.escapeHtml(message.sender.name)}</div>` : ''}
                <div class="message-content">${this.escapeHtml(message.content)}</div>
                <div class="message-time">${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                ${deleteButton}
            </div>
        `;
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
        
        // Callback if provided
        if (this.onMessageReceived) {
            this.onMessageReceived(message);
        }
    }
    
    async sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input ? input.value.trim() : '';
        
        if (!message || !this.currentChatUser) {
            console.log('Cannot send: no message or no current chat user');
            return;
        }
        
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn) sendBtn.disabled = true;
        
        try {
            const response = await fetch(`${this.apiBase}/chat/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiverId: this.currentChatUser.id,
                    content: message,
                    type: 'text'
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessageToUI(data.data);
                if (input) input.value = '';
            } else {
                this.showToast(data.message || 'Failed to send message', 'error');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('Failed to send message', 'error');
        } finally {
            if (sendBtn) sendBtn.disabled = false;
            if (input) input.focus();
        }
    }
    
    async deleteMessage(messageId) {
        if (!confirm('Are you sure you want to delete this message?')) {
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBase}/chat/message/${messageId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (data.success) {
                const messageElement = document.querySelector(`.chat-message[data-message-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.remove();
                    this.showToast('Message deleted successfully', 'success');
                }
            } else {
                this.showToast(data.message || 'Failed to delete message', 'error');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            this.showToast('Failed to delete message', 'error');
        }
    }
    
    closeChat() {
        const modal = document.getElementById('chatModal');
        if (modal) modal.classList.remove('show');
        
        if (this.socket && this.currentConversationId) {
            this.socket.emit('leave_conversation', this.currentConversationId);
            this.currentConversationId = null;
        }
        
        this.currentChatUser = null;
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showToast(message, type = "info") {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${this.escapeHtml(message)}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }, 100);
    }
}

// Make available globally
window.ChatModule = ChatModule;

// Helper function to initialize chat module
window.initChatModule = function(apiBase = '/api/learn') {
    if (window.socket && window.currentUser && !window.chatModule) {
        window.chatModule = new ChatModule(window.socket, window.currentUser, {
            apiBase: '/api/teacher'
        });
        console.log('Chat module initialized successfully');
        return true;
    }
    return false;
};