import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { HEYGEN_AVATAR_HTML } from '../components/HeygenAvatarHtml';

function resolveBackendUrl() {
  // Try to infer LAN IP from Expo in dev
  const debuggerHost = Constants?.expoConfig?.hostUri || Constants?.expoGoConfig?.debuggerHost || Constants?.manifest2?.extra?.expoClient?.hostUri || '';
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:4000`;
  }
  // Fallback (iOS simulator): localhost
  return 'http://localhost:4000';
}

export default function HeygenAvatarScreen() {
  const webviewRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isHtmlReady, setIsHtmlReady] = useState(true);
  const [webViewReady, setWebViewReady] = useState(false);

  const BACKEND_URL = resolveBackendUrl().replace(':4000', ':4001');

  const onMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Message from WebView:', data);
      
      switch (data.type) {
        case 'ready':
          console.log('WebView is ready');
          setWebViewReady(true);
          break;
        case 'status':
          console.log('Avatar status:', data.message);
          // Check if avatar is connected and send welcome message
          if (data.message === 'Avatar connected!' && webviewRef.current) {
            console.log('Avatar connected, sending coffee wellness message...');
            // Wait longer to let HeyGen's default intro finish, then send our message
            setTimeout(() => {
              console.log('Sending coffee wellness coach message now...');
              webviewRef.current.postMessage(JSON.stringify({
                type: 'speak',
                text: 'Hello! I am your coffee wellness coach. I see you enjoyed Turkish coffee this morning - excellent choice! Turkish coffee is rich in antioxidants and helps boost your happy mood even further. The traditional preparation method preserves more beneficial compounds than regular coffee. Since you are feeling great, this is the perfect time to set positive intentions for your day. Remember to stay hydrated and savor each moment of your elevated mood!'
              }));
            }, 5000); // Wait 5 seconds to let HeyGen intro finish
          }
          break;
        case 'speaking':
          console.log('Avatar is speaking:', data.text);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.log('Error parsing WebView message:', error);
    }
  }, []);

  const injectedBridgeScript = useMemo(() => `
    (function() {
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
          // You can pass avatarId, voiceId from UI later if needed
        })
      });
      if (!response.ok) {
        const text = await response.text();
        let errorData;
        try { errorData = JSON.parse(text); } catch (_) {}
        
        // Handle concurrent session limit specifically
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
      setErrorMessage(error?.message ?? 'Bilinmeyen hata');
    } finally {
      setIsLoading(false);
    }
  }, [BACKEND_URL]);

  const speakMessage = useCallback((text) => {
    if (webViewReady && webviewRef.current) {
      console.log('Sending speak message:', text);
      webviewRef.current.postMessage(JSON.stringify({
        type: 'speak',
        text: text || 'Hello! I am your coffee wellness coach. I see you enjoyed Turkish coffee this morning - excellent choice! Turkish coffee is rich in antioxidants and helps boost your happy mood even further. The traditional preparation method preserves more beneficial compounds than regular coffee. Since you are feeling great, this is the perfect time to set positive intentions for your day. Remember to stay hydrated and savor each moment of your elevated mood!'
      }));
    }
  }, [webViewReady]);

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
      
      // Send disconnect message to WebView
      if (webviewRef.current && webViewReady) {
        webviewRef.current.postMessage(JSON.stringify({
          type: 'disconnect'
        }));
      }
      // Optionally, show a success message to the user
    } catch (error) {
      console.error('Error stopping session:', error);
      // Optionally, show an error message to the user
    }
  }, [currentSessionId, BACKEND_URL, webViewReady]);

  // HTML is ready immediately since it's inline
  useEffect(() => {
    console.log('HTML content ready for WebView');
    setIsHtmlReady(true);
  }, []);

  // Initialize avatar when both WebView is ready and we have session data
  useEffect(() => {
    if (webViewReady && sessionData && webviewRef.current) {
      console.log('Initializing avatar with session data:', sessionData);
      webviewRef.current.postMessage(JSON.stringify({
        type: 'initialize',
        sessionData: sessionData
      }));
    }
  }, [webViewReady, sessionData]);

  useEffect(() => {
    if (isHtmlReady) {
      fetchSessionUrl();
    }

    // Clean up session on unmount
    return () => {
      if (currentSessionId) {
        stopSession();
      }
    };
  }, [isHtmlReady]);

  if (isLoading || !isHtmlReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#fff" />
        <Text style={{ color: '#fff', marginTop: 12 }}>Loading avatar interface...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000' }}>
        <Text style={{ color: 'tomato', textAlign: 'center' }}>{String(errorMessage)}</Text>
        <TouchableOpacity onPress={fetchSessionUrl} style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#fff', borderRadius: 6 }}>
          <Text>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {errorMessage ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000' }}>
          <Text style={{ color: 'tomato', textAlign: 'center' }}>{String(errorMessage)}</Text>
          <TouchableOpacity onPress={fetchSessionUrl} style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#fff', borderRadius: 6 }}>
            <Text>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <ActivityIndicator color="#fff" />
          <Text style={{ color: '#fff', marginTop: 12 }}>Oturum hazırlanıyor…</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
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
            style={{ backgroundColor: '#000' }}
          />
          <View style={{
            position: 'absolute',
            bottom: 20,
            alignSelf: 'center',
            flexDirection: 'row',
            gap: 10
          }}>
            <TouchableOpacity
              onPress={() => speakMessage()}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 20,
                backgroundColor: 'blue',
                borderRadius: 5,
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>Coffee Tip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={stopSession}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 20,
                backgroundColor: 'red',
                borderRadius: 5,
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>Stop</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
} 