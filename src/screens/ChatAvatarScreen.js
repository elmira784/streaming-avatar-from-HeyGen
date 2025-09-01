import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  ActivityIndicator, 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  StyleSheet, 
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard
} from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { HEYGEN_AVATAR_HTML } from '../components/HeygenAvatarHtml';

function resolveBackendUrl() {
  const debuggerHost = Constants?.expoConfig?.hostUri || Constants?.expoGoConfig?.debuggerHost || Constants?.manifest2?.extra?.expoClient?.hostUri || '';
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:4000`;
  }
  return 'http://localhost:4000';
}

export default function ChatAvatarScreen({ selectedAvatar, onBack, onSessionComplete }) {
  const webviewRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const speechStartTimeRef = useRef(null);
  
  // Core state
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [webViewReady, setWebViewReady] = useState(false);
  
  // Chat specific state
  const [userPrompt, setUserPrompt] = useState('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(10);
  const [spokenText, setSpokenText] = useState('');
  const [chatPhase, setChatPhase] = useState('input'); // 'input', 'speaking', 'completed'

  const BACKEND_URL = resolveBackendUrl().replace(':4000', ':4001');
  const SESSION_DURATION = 10000; // 10 seconds

  // No automatic countdown - session ends when avatar finishes speaking

  const handleSessionComplete = useCallback(async () => {
    // Prevent multiple completion calls
    if (chatPhase === 'completed') {
      console.log('Session already completed, ignoring duplicate call');
      return;
    }
    
    console.log('Session completed - cleaning up');
    setIsSessionActive(false);
    setIsAvatarSpeaking(false);
    setChatPhase('completed');
    
    // Clear session timer
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    // Stop the session
    await stopSession();
    
    // Notify parent component with results
    if (onSessionComplete) {
      onSessionComplete({
        prompt: userPrompt,
        spokenText: spokenText,
        duration: speechStartTimeRef.current ? Math.floor((Date.now() - speechStartTimeRef.current) / 1000) : 0
      });
    }
  }, [userPrompt, spokenText, chatPhase]);

  const onMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Message from WebView:', data);
      
      switch (data.type) {
        case 'ready':
          console.log('WebView is ready');
          setWebViewReady(true);
          break;
        case 'debug':
          console.log('🔍 DEBUG FROM WEBVIEW:', data.message);
          break;
        case 'status':
          console.log('Avatar status:', data.message);
          if (data.message === 'Avatar connected!' && webviewRef.current && chatPhase === 'speaking') {
            // Avatar is connected, wait longer before sending prompt to ensure stability
            console.log('Avatar connected! Waiting 5 seconds before speaking to ensure session is fully ready...');
            setTimeout(() => {
              console.log('Sending user prompt to avatar after delay:', userPrompt);
              sendPromptToAvatar(userPrompt);
            }, 5000); // Increased delay to 5 seconds for session stability
          }
          break;
        case 'speaking':
          console.log('Avatar is speaking:', data.text);
          setIsAvatarSpeaking(true);
          setSpokenText(data.text); // Use the text that avatar is actually speaking
          
          // Start the session only when avatar actually starts speaking
          if (!speechStartTimeRef.current && !isSessionActive) {
            console.log('Avatar started speaking');
            speechStartTimeRef.current = Date.now();
            setIsSessionActive(true);
            
            // No automatic timer - let avatar speak naturally
            // Session will end when avatar finishes or user manually stops
          }
          break;
        case 'speech_ended':
          console.log('Avatar finished speaking');
          setIsAvatarSpeaking(false);
          // Auto-complete session when avatar naturally finishes speaking
          handleSessionComplete();
          break;
        case 'error':
          console.error('Avatar error:', data.message);
          setErrorMessage('Avatar error: ' + data.message);
          setChatPhase('input');
          setIsSessionActive(false);
          break;
        case 'test':
          console.log('✅ Received test message from WebView:', data.message);
          console.log('WebView bridge is working correctly');
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.log('Error parsing WebView message:', error);
    }
  }, [userPrompt, isSessionActive, chatPhase, handleSessionComplete]);

  const injectedBridgeScript = useMemo(() => `
    (function() {
      console.log('Injected JavaScript running');
      console.log('ReactNativeWebView available:', !!window.ReactNativeWebView);
      
      // Test message sending capability
      if (window.ReactNativeWebView) {
        console.log('Sending test message from injected JS');
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'debug',
          message: 'Injected JavaScript loaded successfully'
        }));
      }
      
      function postToRN(message) {
        if (window && window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
      }
      window.__HEYGEN_BRIDGE__ = { postToRN };
    })();
    true;
  `, []);

  const fetchSessionUrl = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${BACKEND_URL}/api/heygen/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarId: selectedAvatar?.id || 'Thaddeus_ProfessionalLook_public'
        })
      });
      
      if (!response.ok) {
        const text = await response.text();
        let errorData;
        try { errorData = JSON.parse(text); } catch (_) {}
        
        if (response.status === 429 && errorData?.code === 10004) {
          throw new Error(`Session Limit Reached: ${errorData.message || 'Please wait 10 minutes or upgrade your plan.'}`);
        }
        
        throw new Error(`Backend error ${response.status}: ${errorData?.message || text}`);
      }
      
      const json = await response.json();
      console.log('Backend response structure:', JSON.stringify(json, null, 2));
      
      if (!json?.sessionUrl || !json?.sessionId) {
        console.error('Missing sessionUrl or sessionId in response:', json);
        throw new Error('Invalid response: sessionUrl or sessionId not found.');
      }
      
      setSessionData({
        sessionId: json.sessionId,
        sessionUrl: json.sessionUrl,
        offer: json.offer,
        iceServers: json.iceServers,
        backendUrl: BACKEND_URL
      });
      setCurrentSessionId(json.sessionId);
    } catch (error) {
      setErrorMessage(error?.message ?? 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [BACKEND_URL, selectedAvatar]);

  const sendPromptToAvatar = useCallback((text) => {
    console.log('🚀 sendPromptToAvatar called with:', text);
    console.log('🚀 Conditions:', { webViewReady, hasWebviewRef: !!webviewRef.current, hasText: !!text?.trim() });
    
    if (webviewRef.current && text.trim()) {
      console.log('✅ All conditions met, processing prompt:', text);
      
      // Parse user message for time and mood context
      const lowerText = text.toLowerCase();
      const avatarName = selectedAvatar?.name || 'Coach';
      
      // Extract time context
      let timeContext = '';
      if (lowerText.includes('morning') || lowerText.includes('breakfast')) {
        timeContext = 'morning';
      } else if (lowerText.includes('afternoon') || lowerText.includes('lunch')) {
        timeContext = 'afternoon';
      } else if (lowerText.includes('evening') || lowerText.includes('night')) {
        timeContext = 'evening';
      }
      
      // Extract mood context
      let moodContext = '';
      if (lowerText.includes('happy') || lowerText.includes('good') || lowerText.includes('great')) {
        moodContext = 'positive';
      } else if (lowerText.includes('sad') || lowerText.includes('tired') || lowerText.includes('down')) {
        moodContext = 'low';
      } else if (lowerText.includes('stressed') || lowerText.includes('anxious')) {
        moodContext = 'stressed';
      }
      
      // Create personalized response like live chat
      let avatarResponse = '';
      
      if (selectedAvatar?.name === 'Bora') {
        let greeting = timeContext === 'morning' ? 'Good morning!' : 
                      timeContext === 'afternoon' ? 'Good afternoon!' : 
                      timeContext === 'evening' ? 'Good evening!' : 'Hello!';
        
        avatarResponse = `${greeting} I'm Bora, your Turkish coffee wellness expert. `;
        
        if (moodContext === 'low') {
          avatarResponse += `Turkish coffee's rich antioxidants and natural warmth will help lift your spirits this ${timeContext || 'time'}. The brewing ritual is grounding when you're feeling down.`;
        } else if (moodContext === 'positive') {
          avatarResponse += `Your positive energy is wonderful! Turkish coffee will amplify that happiness with sustained, focused energy. Perfect timing for this wellness ritual!`;
        } else if (moodContext === 'stressed') {
          avatarResponse += `Turkish coffee's slow brewing ritual is naturally calming, creating alert relaxation rather than jittery energy. Take this moment to breathe and center yourself.`;
        } else {
          avatarResponse += `Perfect timing for Turkish coffee this ${timeContext || 'time'}! The antioxidants will boost your focus and wellbeing naturally.`;
        }
      } else if (selectedAvatar?.name === 'Parla') {
        let greeting = timeContext === 'morning' ? 'Beautiful morning!' : 
                      timeContext === 'afternoon' ? 'Lovely afternoon!' : 
                      timeContext === 'evening' ? 'Peaceful evening!' : 'Hello beautiful!';
        
        avatarResponse = `${greeting} I'm Parla, your wellness coach. `;
        
        if (moodContext === 'low') {
          avatarResponse += `Turkish coffee can be your gentle companion right now. Its warmth and antioxidants naturally support your mood while creating a moment of self-care you deserve.`;
        } else if (moodContext === 'positive') {
          avatarResponse += `Your beautiful energy this ${timeContext || 'time'} just lights up my heart! Turkish coffee will dance with your happiness, creating even more joy and vitality.`;
        } else if (moodContext === 'stressed') {
          avatarResponse += `Turkish coffee can be your sanctuary - the ritual forces you to pause and breathe, while antioxidants naturally calm your nervous system.`;
        } else {
          avatarResponse += `Perfect moment for Turkish coffee this ${timeContext || 'time'}! This ritual will nurture both your body and spirit with beautiful wellness benefits.`;
        }
      }
      
      // Keep response focused and concise
      
      console.log('=== SENDING SPEAK MESSAGE TO WEBVIEW ===');
      console.log('WebView ref exists:', !!webviewRef.current);
      console.log('WebView ready:', webViewReady);
      console.log('Chat phase:', chatPhase);
      console.log('Message being sent:', { type: 'speak', text: avatarResponse.substring(0, 100) + '...' });
      
      if (!webviewRef.current) {
        console.error('❌ WebView ref not available');
        return;
      }
      
      // Use direct JavaScript injection with better debugging
      const sendSpeakCommand = () => {
        const escapedText = avatarResponse.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/'/g, "\\'");
        const injectedJS = `
          console.log('🎯 Direct injection: Making avatar speak');
          console.log('🎯 window.avatarClient exists:', !!window.avatarClient);
          console.log('🎯 speakText method exists:', !!window.avatarClient?.speakText);
          console.log('🎯 Avatar connected:', window.avatarClient?.isConnected);
          
          // Send status back to React Native
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'debug',
              message: 'Injection received: avatarClient=' + !!window.avatarClient + ', speakText=' + !!window.avatarClient?.speakText + ', connected=' + window.avatarClient?.isConnected
            }));
          }
          
          if (window.avatarClient && window.avatarClient.speakText) {
            console.log('🎯 Calling speakText with:', "${escapedText}".substring(0, 50));
            window.avatarClient.speakText("${escapedText}");
            
            // Confirm the call was made
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'debug',
                message: 'speakText called successfully'
              }));
            }
          } else {
            console.error('🎯 Avatar client not available');
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'debug',
                message: 'Avatar client not available: ' + (window.avatarClient ? 'client exists but no speakText' : 'no client')
              }));
            }
          }
          true;
        `;
        
        console.log('Injecting JavaScript directly:', injectedJS.substring(0, 200) + '...');
        webviewRef.current.injectJavaScript(injectedJS);
      };
      
      sendSpeakCommand();
      
      // Don't set spokenText here - wait for avatar to confirm it's speaking
      // setSpokenText(avatarResponse);
      speechStartTimeRef.current = Date.now();
    } else {
      console.error('❌ Conditions not met for sending prompt:', {
        hasWebviewRef: !!webviewRef.current,
        hasText: !!text?.trim(),
        text
      });
    }
  }, [selectedAvatar]);

  const stopSession = useCallback(async () => {
    if (!currentSessionId) {
      console.log('No active session to stop.');
      return;
    }
    console.log('Attempting to stop session:', currentSessionId);
    try {
      const response = await fetch(`${BACKEND_URL}/api/heygen/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Backend stop error ${response.status}: ${text}`);
      }
      const json = await response.json();
      console.log('Stop Session Response:', json);
      setCurrentSessionId(null);
      setSessionData(null);
      
      if (webviewRef.current && webViewReady) {
        webviewRef.current.postMessage(JSON.stringify({
          type: 'disconnect'
        }));
      }
    } catch (error) {
      console.error('Error stopping session:', error);
    }
  }, [currentSessionId, BACKEND_URL, webViewReady]);

  const startChatSession = useCallback(async () => {
    if (!userPrompt.trim()) {
      Alert.alert('Please enter a message', 'Type something you want to ask the avatar about.');
      return;
    }

    if (userPrompt.length < 5) {
      Alert.alert('Message too short', 'Please write a more detailed message for a better response.');
      return;
    }

    console.log('Starting chat session with prompt:', userPrompt);
    Keyboard.dismiss();
    
    setChatPhase('speaking');
    setIsSessionActive(false); // Don't activate until avatar starts speaking
    setErrorMessage('');
    speechStartTimeRef.current = null;
    
    try {
      // Initialize avatar session (don't start timer yet)
      await fetchSessionUrl();
      // Timer will start when avatar begins speaking (in onMessage handler)
    } catch (error) {
      console.error('Failed to start chat session:', error);
      setErrorMessage('Failed to start session: ' + error.message);
      setChatPhase('input');
      setIsSessionActive(false);
    }
  }, [userPrompt, fetchSessionUrl]);

  const resetChat = useCallback(() => {
    setUserPrompt('');
    setIsSessionActive(false);
    setIsAvatarSpeaking(false);
    setSpokenText('');
    setChatPhase('input');
    setSessionData(null);
    setCurrentSessionId(null);
    
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  // Initialize avatar when both WebView is ready and we have session data
  useEffect(() => {
    console.log('Avatar initialization check:', {
      webViewReady,
      hasSessionData: !!sessionData,
      hasWebviewRef: !!webviewRef.current,
      chatPhase,
      currentSessionId
    });
    
    if (webViewReady && sessionData && webviewRef.current && chatPhase === 'speaking') {
      console.log('Starting avatar initialization - session will not be cleaned up during this phase');
      console.log('Initializing avatar with session data:', {
        sessionId: sessionData.sessionId,
        hasOffer: !!sessionData.offer,
        hasSessionUrl: !!sessionData.sessionUrl
      });
      
      webviewRef.current.postMessage(JSON.stringify({
        type: 'initialize',
        sessionData: sessionData
      }));
    }
  }, [webViewReady, sessionData, chatPhase, currentSessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentSessionId && chatPhase !== 'speaking') {
        // Only cleanup if not in active speaking phase to avoid race condition
        stopSession();
      }
      if (sessionTimerRef.current) {
        clearTimeout(sessionTimerRef.current);
      }
    };
  }, [currentSessionId, stopSession, chatPhase]);

  // Render different phases
  if (chatPhase === 'input') {
    return (
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.chatInputContainer}>
          <View style={styles.topSection}>
            <View style={styles.headerContainer}>
              <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Chat with {selectedAvatar?.name}</Text>
            </View>

            <View style={styles.avatarPreview}>
              <View style={[styles.avatarIcon, { backgroundColor: selectedAvatar?.color }]}>
                <Text style={styles.avatarEmoji}>{selectedAvatar?.icon}</Text>
              </View>
              <Text style={styles.avatarName}>{selectedAvatar?.name}</Text>
              <Text style={styles.avatarSubtitle}>{selectedAvatar?.subtitle}</Text>
            </View>

            <View style={styles.instructionContainer}>
              <Text style={styles.instructionTitle}>How it works:</Text>
              <Text style={styles.instructionText}>• Write your message below</Text>
              <Text style={styles.instructionText}>• {selectedAvatar?.name} will respond for exactly 10 seconds</Text>
              <Text style={styles.instructionText}>• Session automatically ends after 10 seconds</Text>
              <Text style={styles.instructionText}>• You'll see the full transcript at the end</Text>
            </View>
          </View>

          <View style={styles.bottomSection}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder={`Ask ${selectedAvatar?.name} anything about wellness...`}
                placeholderTextColor="#666"
                value={userPrompt}
                onChangeText={setUserPrompt}
                multiline
                maxLength={200}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={startChatSession}
                enablesReturnKeyAutomatically={true}
                blurOnSubmit={false}
              />
              <Text style={styles.charCount}>{userPrompt.length}/200</Text>
            </View>

            <TouchableOpacity 
              style={[styles.startButton, { backgroundColor: selectedAvatar?.color }]}
              onPress={startChatSession}
              disabled={!userPrompt.trim()}
            >
              <Text style={styles.startButtonText}>
                Start 10-Second Chat
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (chatPhase === 'speaking') {
    return (
      <View style={styles.container}>
        {/* Back Button */}
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Chat with {selectedAvatar?.name}</Text>
        </View>
        
        {errorMessage ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{String(errorMessage)}</Text>
            <TouchableOpacity onPress={resetChat} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loadingText}>Connecting to {selectedAvatar?.name}...</Text>
          </View>
        ) : (
          <View style={styles.avatarContainer}>
            <WebView
              ref={webviewRef}
              source={{ html: HEYGEN_AVATAR_HTML }}
              onMessage={onMessage}
              injectedJavaScript={injectedBridgeScript}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsAirPlayForMediaPlayback={true}
              mixedContentMode="compatibility"
              javaScriptEnabled
              domStorageEnabled
              allowsFullscreenVideo
              allowsBackForwardNavigationGestures={false}
              style={styles.webview}
            />
            

            {/* User Prompt Display - Only show when not speaking */}
            {!isAvatarSpeaking && (
              <View style={styles.promptOverlay}>
                <Text style={styles.promptLabel}>Your Message:</Text>
                <Text style={styles.promptText}>"{userPrompt}"</Text>
              </View>
            )}

          </View>
        )}
      </View>
    );
  }

  if (chatPhase === 'completed') {
    return (
      <View style={styles.container}>
        <View style={styles.completedContainer}>
          <View style={styles.headerContainer}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Session Complete</Text>
          </View>

          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>Chat Summary</Text>
            
            <View style={styles.resultItem}>
              <Text style={styles.resultLabel}>Your Message:</Text>
              <Text style={styles.resultText}>"{userPrompt}"</Text>
            </View>

            <View style={styles.resultItem}>
              <Text style={styles.resultLabel}>{selectedAvatar?.name}'s Response:</Text>
              <Text style={styles.resultText}>"{spokenText}"</Text>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.actionButton, styles.newChatButton, { backgroundColor: selectedAvatar?.color }]}
                onPress={resetChat}
              >
                <Text style={styles.actionButtonText}>New Chat</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.actionButton, styles.backHomeButton]}
                onPress={onBack}
              >
                <Text style={styles.actionButtonText}>Back to Selection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  chatInputContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  topSection: {
    flex: 1,
  },
  bottomSection: {
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#fff',
    marginRight: 15,
  },
  backButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  avatarPreview: {
    alignItems: 'center',
    marginVertical: 30,
  },
  avatarIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarEmoji: {
    fontSize: 30,
  },
  avatarName: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  avatarSubtitle: {
    color: '#ccc',
    fontSize: 16,
  },
  instructionContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    borderRadius: 10,
    marginVertical: 20,
  },
  instructionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  instructionText: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 5,
  },
  inputContainer: {
    marginVertical: 20,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: 'white',
    padding: 15,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#555',
    fontSize: 16,
    minHeight: 120,
    maxHeight: 160,
    textAlignVertical: 'top',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  charCount: {
    color: '#666',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 5,
  },
  startButton: {
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  avatarContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  timerOverlay: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ff6b6b',
  },
  timerText: {
    color: '#ff6b6b',
    fontSize: 24,
    fontWeight: 'bold',
  },
  timerLabel: {
    color: 'white',
    fontSize: 12,
    marginTop: 2,
  },
  promptOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 20,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#4A90E2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
  promptLabel: {
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  promptText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 20,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  completedContainer: {
    flex: 1,
    padding: 20,
  },
  resultsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  resultsTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  resultItem: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
  },
  resultLabel: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  resultText: {
    color: 'white',
    fontSize: 16,
    lineHeight: 24,
  },
  actionButtons: {
    marginTop: 30,
  },
  actionButton: {
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  newChatButton: {
    // backgroundColor set dynamically
  },
  backHomeButton: {
    backgroundColor: '#333',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});