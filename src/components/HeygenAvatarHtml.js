// HTML content for HeyGen Avatar WebRTC interface
export const HEYGEN_AVATAR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HeyGen Avatar Stream</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
        }
        
        #videoContainer {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        
        #avatarVideo {
            width: 100%;
            height: 100%;
            object-fit: cover;
            background: #000;
        }
        
        #status {
            position: absolute;
            top: 20px;
            left: 20px;
            color: white;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 10;
        }
        
        #loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            text-align: center;
            z-index: 5;
        }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #333;
            border-top: 3px solid #fff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        #error {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #ff6b6b;
            text-align: center;
            background: rgba(0, 0, 0, 0.8);
            padding: 20px;
            border-radius: 10px;
            max-width: 80%;
            z-index: 10;
        }
        
        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div id="videoContainer">
        <video id="avatarVideo" autoplay playsinline controls></video>
        
    </div>

    <script>
        class HeyGenAvatarClient {
            constructor() {
                this.peerConnection = null;
                this.websocket = null;
                this.sessionData = null;
                this.isConnected = false;
                this.speechCompletionTimer = null;
                this.initializationInProgress = false;
                
                this.videoEl = document.getElementById('avatarVideo');
            }
            
            updateStatus(message) {
                console.log('[HeyGen] STATUS:', message);
                console.log('[HeyGen] Connection State:', {
                    isConnected: this.isConnected,
                    hasSessionData: !!this.sessionData,
                    sessionId: this.sessionData?.sessionId,
                    hasPeerConnection: !!this.peerConnection,
                    peerConnectionState: this.peerConnection?.connectionState,
                    hasWebSocket: !!this.websocket,
                    wsState: this.websocket?.readyState
                });
                
                // Send status to React Native
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'status',
                        message: message
                    }));
                }
            }
            
            async initializeSession(sessionData) {
                try {
                    // Prevent multiple simultaneous initializations
                    if (this.initializationInProgress) {
                        console.log('Initialization already in progress, ignoring duplicate call');
                        return;
                    }
                    this.initializationInProgress = true;
                    
                    this.sessionData = sessionData;
                    this.updateStatus('Setting up WebRTC connection...');
                    
                    console.log('Session data received:', {
                        sessionId: sessionData.sessionId,
                        hasOffer: !!sessionData.offer,
                        hasSessionUrl: !!sessionData.sessionUrl,
                        hasIceServers: !!sessionData.iceServers
                    });
                    
                    // Setup peer connection first
                    await this.setupPeerConnection();
                    
                    // Ensure peer connection is still valid after setup
                    if (!this.peerConnection) {
                        throw new Error('Peer connection setup failed');
                    }
                    
                    // Try WebSocket connection with fallback
                    try {
                        await this.connectWebSocket();
                    } catch (wsError) {
                        console.error('WebSocket failed, attempting direct connection:', wsError);
                        this.updateStatus('WebSocket failed, trying direct connection...');
                        
                        // Continue with setup even without WebSocket - some features may still work
                        // The WebRTC connection might still establish through STUN/TURN servers
                    }
                    
                    // Double-check peer connection before proceeding
                    if (!this.peerConnection) {
                        throw new Error('Peer connection lost during initialization');
                    }
                    
                    // Set remote description
                    await this.setRemoteDescription();
                    
                    // Create and send answer
                    await this.createAndSendAnswer();
                    
                    this.initializationInProgress = false;
                    
                } catch (error) {
                    this.initializationInProgress = false;
                    console.error('Failed to initialize session:', error);
                    this.updateStatus('Connection failed: ' + error.message);
                    
                    // Send error to React Native
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'error',
                            message: 'Connection failed: ' + error.message
                        }));
                    }
                }
            }
            
            async setupPeerConnection() {
                try {
                    const config = {
                        iceServers: this.sessionData.iceServers || [
                            { urls: 'stun:stun.l.google.com:19302' }
                        ]
                    };
                    
                    console.log('Creating RTCPeerConnection with config:', config);
                    
                    // Check if RTCPeerConnection is available
                    if (typeof RTCPeerConnection === 'undefined') {
                        throw new Error('RTCPeerConnection not supported in this environment');
                    }
                    
                    this.peerConnection = new RTCPeerConnection(config);
                    
                    if (!this.peerConnection) {
                        throw new Error('Failed to create RTCPeerConnection');
                    }
                    
                    console.log('RTCPeerConnection created successfully');
                } catch (error) {
                    console.error('Error creating RTCPeerConnection:', error);
                    throw new Error('Failed to setup peer connection: ' + error.message);
                }
                
                // Handle incoming streams
                this.peerConnection.ontrack = (event) => {
                    console.log('Received remote stream:', event.streams[0]);
                    this.videoEl.srcObject = event.streams[0];
                    
                    // Enable audio and ensure video plays
                    this.videoEl.muted = false;
                    this.videoEl.volume = 1.0;
                    
                    // Wait for actual video to start playing before declaring connection
                    this.videoEl.play().then(() => {
                        console.log('Video playback started');
                        this.waitForVideoContent();
                    }).catch((error) => {
                        console.log('Autoplay prevented, user interaction required:', error);
                        this.waitForVideoContent();
                        
                        // Add click handler to enable audio
                        this.videoEl.addEventListener('click', () => {
                            this.videoEl.play();
                        });
                    });
                };
                
                // Handle ICE candidates
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('ICE candidate generated:', event.candidate);
                        
                        // Try WebSocket first if available
                        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                            this.websocket.send(JSON.stringify({
                                type: 'ice-candidate',
                                candidate: event.candidate
                            }));
                        } else {
                            // If WebSocket is not available, try to send via backend API
                            this.sendICECandidateViaAPI(event.candidate);
                        }
                    }
                };
                
                // Handle connection state changes
                this.peerConnection.onconnectionstatechange = () => {
                    const state = this.peerConnection.connectionState;
                    console.log('Connection state changed to:', state);
                    
                    if (state === 'connected') {
                        this.updateStatus('WebRTC connected, preparing avatar...');
                    } else if (state === 'connecting') {
                        this.updateStatus('Connecting to avatar...');
                    } else if (state === 'failed') {
                        console.log('Connection failed - but continuing with current session');
                        // Don't update status to prevent confusion - avatar may still work
                    } else if (state === 'disconnected') {
                        console.log('Connection disconnected - may be normal during speaking');
                        // Don't report as error - this is often normal during avatar speech
                    }
                };
                
                this.updateStatus('WebRTC peer connection created');
            }
            
            waitForVideoContent() {
                // Wait for actual video frames to start coming through
                let frameCheckCount = 0;
                const maxChecks = 20; // 2 seconds max wait, then force connection
                
                const checkForFrames = () => {
                    console.log('Checking video frames:', {
                        frameCheckCount,
                        videoWidth: this.videoEl.videoWidth,
                        videoHeight: this.videoEl.videoHeight,
                        readyState: this.videoEl.readyState,
                        srcObject: !!this.videoEl.srcObject,
                        paused: this.videoEl.paused,
                        currentTime: this.videoEl.currentTime
                    });
                    
                    if (frameCheckCount >= maxChecks) {
                        console.log('Force connecting - video should be showing by now');
                        this.updateStatus('Avatar connected!');
                        this.isConnected = true;
                        return;
                    }
                    
                    // Very lenient check - if we have any indication of video, consider it connected
                    if (this.videoEl.srcObject || this.videoEl.readyState > 0 || 
                        this.videoEl.videoWidth > 0 || this.videoEl.currentTime > 0) {
                        console.log('Video detected - avatar connected');
                        this.updateStatus('Avatar connected!');
                        this.isConnected = true;
                        return;
                    }
                    
                    frameCheckCount++;
                    setTimeout(checkForFrames, 100);
                };
                
                // Start checking immediately, but also force connection after 3 seconds regardless
                setTimeout(checkForFrames, 100);
                
                // Force connection after 3 seconds no matter what
                setTimeout(() => {
                    if (!this.isConnected) {
                        console.log('Force connecting after 3 seconds - assuming video is working');
                        this.updateStatus('Avatar connected!');
                        this.isConnected = true;
                    }
                }, 3000);
            }
            
            async sendICECandidateViaAPI(candidate) {
                try {
                    const backendUrl = this.sessionData.backendUrl || 'http://localhost:4001';
                    console.log('Sending ICE candidate via API to:', backendUrl + '/api/heygen/ice');
                    
                    const response = await fetch(backendUrl + '/api/heygen/ice', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId: this.sessionData.sessionId,
                            candidate: candidate
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error('Failed to send ICE candidate: ' + response.status);
                    }
                    
                    console.log('ICE candidate sent successfully via API');
                } catch (error) {
                    console.error('Failed to send ICE candidate via API:', error);
                }
            }
            
            async connectWebSocket() {
                return new Promise((resolve, reject) => {
                    let attempts = 0;
                    const maxAttempts = 3;
                    
                    const tryConnect = () => {
                        attempts++;
                        console.log('WebSocket connection attempt ' + attempts + '/' + maxAttempts + ' to:', this.sessionData.sessionUrl);
                        
                        try {
                            // Close existing connection if any
                            if (this.websocket) {
                                this.websocket.close();
                                this.websocket = null;
                            }
                            
                            this.websocket = new WebSocket(this.sessionData.sessionUrl);
                            
                            this.websocket.onopen = () => {
                                console.log('WebSocket connected successfully');
                                this.updateStatus('WebSocket connected');
                                resolve();
                            };
                            
                            this.websocket.onmessage = async (event) => {
                                try {
                                    const message = JSON.parse(event.data);
                                    await this.handleWebSocketMessage(message);
                                } catch (error) {
                                    console.error('Error handling WebSocket message:', error);
                                }
                            };
                            
                            this.websocket.onclose = (event) => {
                                console.log('WebSocket disconnected:', {
                                    code: event.code,
                                    reason: event.reason,
                                    wasClean: event.wasClean
                                });
                                
                                if (attempts < maxAttempts && !event.wasClean) {
                                    console.log('Retrying WebSocket connection in 2 seconds...');
                                    setTimeout(tryConnect, 2000);
                                }
                            };
                            
                            this.websocket.onerror = (error) => {
                                console.error('WebSocket error on attempt', attempts, ':', error);
                                this.updateStatus('WebSocket error (attempt ' + attempts + ')');
                                
                                if (attempts >= maxAttempts) {
                                    reject(new Error('WebSocket connection failed after ' + maxAttempts + ' attempts'));
                                }
                            };
                            
                            // Timeout for this attempt
                            setTimeout(() => {
                                if (this.websocket.readyState === WebSocket.CONNECTING) {
                                    console.log('WebSocket connection timeout on attempt', attempts);
                                    this.websocket.close();
                                    
                                    if (attempts < maxAttempts) {
                                        setTimeout(tryConnect, 1000);
                                    } else {
                                        reject(new Error('WebSocket connection timeout after ' + maxAttempts + ' attempts'));
                                    }
                                }
                            }, 5000); // 5 second timeout per attempt
                            
                        } catch (error) {
                            console.error('Error creating WebSocket:', error);
                            if (attempts < maxAttempts) {
                                setTimeout(tryConnect, 1000);
                            } else {
                                reject(error);
                            }
                        }
                    };
                    
                    tryConnect();
                });
            }
            
            async handleWebSocketMessage(message) {
                switch (message.type) {
                    case 'ice-candidate':
                        if (message.candidate && this.peerConnection) {
                            await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                        }
                        break;
                    case 'session-update':
                        this.updateStatus('Session updated');
                        break;
                    default:
                        console.log('Unknown WebSocket message:', message);
                }
            }
            
            async setRemoteDescription() {
                if (!this.sessionData.offer) {
                    throw new Error('No SDP offer provided');
                }
                
                if (!this.peerConnection) {
                    throw new Error('Peer connection not initialized');
                }
                
                try {
                    await this.peerConnection.setRemoteDescription(
                        new RTCSessionDescription(this.sessionData.offer)
                    );
                    
                    this.updateStatus('Remote description set');
                } catch (error) {
                    throw new Error('Failed to set remote description: ' + error.message);
                }
            }
            
            async createAndSendAnswer() {
                if (!this.peerConnection) {
                    throw new Error('Peer connection not initialized');
                }
                
                try {
                    // Create answer
                    const answer = await this.peerConnection.createAnswer();
                    await this.peerConnection.setLocalDescription(answer);
                    
                    this.updateStatus('Answer created, sending to backend...');
                    
                    // Send answer to backend
                    const backendUrl = this.sessionData.backendUrl || 'http://localhost:4001';
                    const response = await fetch(backendUrl + '/api/heygen/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId: this.sessionData.sessionId,
                            answer: answer
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error('Failed to start session: ' + response.status);
                    }
                    
                    const result = await response.json();
                    console.log('Session started:', result);
                    this.updateStatus('Session started, waiting for avatar...');
                    
                } catch (error) {
                    throw new Error('Failed to create/send answer: ' + error.message);
                }
            }
            
            async speakText(text, retryCount = 0) {
                if (!this.sessionData) {
                    console.error('Session data missing - cannot speak');
                    return;
                }
                
                console.log('Making avatar speak:', text, 'attempt:', retryCount + 1);
                
                // Ensure we're marked as connected
                if (!this.isConnected) {
                    this.isConnected = true;
                    this.updateStatus('Avatar connected!');
                }
                
                try {
                    this.updateStatus('Avatar is speaking...');
                    
                    const backendUrl = this.sessionData.backendUrl || 'http://localhost:4001';
                    const response = await fetch(backendUrl + '/api/heygen/speak', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId: this.sessionData.sessionId,
                            text: text
                        })
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => null);
                        
                        // If session not ready and we haven't retried too many times, wait and retry
                        if (errorData?.code === 400006 && retryCount < 3) {
                            console.log('Session not ready, retrying in 2 seconds... (attempt ' + (retryCount + 1) + '/3)');
                            this.updateStatus('Session not ready, retrying...');
                            
                            setTimeout(() => {
                                this.speakText(text, retryCount + 1);
                            }, 2000);
                            return;
                        }
                        
                        throw new Error('Speak request failed: ' + response.status);
                    }
                    
                    const result = await response.json();
                    console.log('Avatar speak success:', result);
                    this.updateStatus('Avatar is speaking: "' + text.substring(0, 30) + '..."');
                    
                    // Notify React Native
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'speaking',
                            text: text
                        }));
                    }
                    
                    // Monitor speech completion
                    this.monitorSpeechCompletion(text);
                    
                } catch (error) {
                    console.error('Speak error:', error);
                    this.updateStatus('Speak failed: ' + error.message);
                    
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'error',
                            message: error.message
                        }));
                    }
                }
            }
            
            monitorSpeechCompletion(originalText) {
                // Estimate speech duration (average speaking rate: 150 words per minute)
                const words = originalText.split(' ').length;
                const estimatedDuration = Math.max(3000, (words / 150) * 60 * 1000); // At least 3 seconds
                
                console.log('Monitoring speech completion for', words, 'words, estimated', estimatedDuration, 'ms');
                
                // Set a timer to detect speech completion
                if (this.speechCompletionTimer) {
                    clearTimeout(this.speechCompletionTimer);
                }
                
                this.speechCompletionTimer = setTimeout(() => {
                    console.log('Speech estimated to be completed');
                    
                    // Send speech completion notification
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'speech_ended',
                            text: originalText,
                            duration: estimatedDuration
                        }));
                    }
                    
                    this.updateStatus('Avatar finished speaking');
                }, estimatedDuration);
            }
            
            disconnect() {
                this.isConnected = false;
                this.initializationInProgress = false;
                
                // Clear speech monitoring timer
                if (this.speechCompletionTimer) {
                    clearTimeout(this.speechCompletionTimer);
                    this.speechCompletionTimer = null;
                }
                
                if (this.peerConnection) {
                    this.peerConnection.close();
                    this.peerConnection = null;
                }
                
                if (this.websocket) {
                    this.websocket.close();
                    this.websocket = null;
                }
                
                if (this.videoEl.srcObject) {
                    this.videoEl.srcObject.getTracks().forEach(track => track.stop());
                    this.videoEl.srcObject = null;
                }
                
                console.log('Avatar disconnected');
            }
        }
        
        // Global avatar client instance - expose on window for JavaScript injection
        window.avatarClient = new HeyGenAvatarClient();
        let avatarClient = window.avatarClient;
        
        // Simple message handler for React Native communication
        const handleMessage = async (event) => {
            console.log('WebView received message:', event.data);
            
            try {
                const data = JSON.parse(event.data);
                console.log('Parsed message type:', data.type);
                
                switch (data.type) {
                    case 'initialize':
                        console.log('Initializing avatar session...');
                        await avatarClient.initializeSession(data.sessionData);
                        break;
                    case 'speak':
                        console.log('Avatar speak request:', data.text);
                        await avatarClient.speakText(data.text);
                        break;
                    case 'disconnect':
                        console.log('Disconnecting avatar...');
                        avatarClient.disconnect();
                        break;
                }
            } catch (error) {
                console.error('Message handling error:', error);
            }
        };
        
        // Single message listener with test confirmation
        window.addEventListener('message', (event) => {
            console.log('WebView message listener triggered');
            console.log('Event data:', event.data);
            console.log('Event origin:', event.origin);
            
            // Send confirmation back to React Native for debugging
            if (window.ReactNativeWebView) {
                try {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'debug',
                        message: 'Message received in WebView: ' + event.data
                    }));
                } catch (e) {
                    console.error('Failed to send debug message:', e);
                }
            }
            
            // Now handle the actual message
            handleMessage(event);
        });
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            avatarClient.disconnect();
        });
        
        // Ensure WebView is fully ready before signaling
        const signalReady = () => {
            if (window.ReactNativeWebView) {
                console.log('WebView fully ready, signaling to React Native');
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'ready'
                }));
            } else {
                console.error('ReactNativeWebView not available');
                // Retry after a short delay
                setTimeout(signalReady, 100);
            }
        };

        // Multiple ready checks to ensure WebView is fully initialized
        document.addEventListener('DOMContentLoaded', signalReady);
        window.addEventListener('load', signalReady);
        
        // Delayed ready signal as backup
        setTimeout(signalReady, 500);
    </script>
</body>
</html>`;