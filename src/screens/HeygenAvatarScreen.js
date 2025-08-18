import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';

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
  const [sessionUrl, setSessionUrl] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null); // Keep track of current session ID

  const BACKEND_URL = resolveBackendUrl().replace(':4000', ':4001');

  const onMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === 'ready') {
        // ready
      }
    } catch (_) {
      // ignore non-JSON messages
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
        throw new Error(`Backend error ${response.status}: ${text}`);
      }
      const json = await response.json();
      if (!json?.sessionUrl || !json.raw?.new?.data?.session_id) {
        throw new Error('Geçersiz yanıt: sessionUrl veya sessionId bulunamadı.');
      }
      setSessionUrl(json.sessionUrl);
      setCurrentSessionId(json.raw.new.data.session_id); // Store the new session ID
    } catch (error) {
      setErrorMessage(error?.message ?? 'Bilinmeyen hata');
    } finally {
      setIsLoading(false);
    }
  }, [BACKEND_URL]);

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
      setCurrentSessionId(null); // Clear session ID on successful stop
      setSessionUrl(''); // Clear WebView URL
      // Optionally, show a success message to the user
    } catch (error) {
      console.error('Error stopping session:', error);
      // Optionally, show an error message to the user
    }
  }, [currentSessionId, BACKEND_URL]);

  useEffect(() => {
    fetchSessionUrl();

    // Optional: Clean up session on unmount/component close
    return () => {
      // if (currentSessionId) { // This might be tricky with component unmount lifecycle
      //   stopSession(); // Be careful with async calls in cleanup
      // }
    };
  }, [fetchSessionUrl]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#fff" />
        <Text style={{ color: '#fff', marginTop: 12 }}>Oturum hazırlanıyor…</Text>
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
            source={{ uri: sessionUrl }}
            onMessage={onMessage}
            injectedJavaScript={injectedBridgeScript}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            style={{ backgroundColor: '#000' }}
          />
          <TouchableOpacity
            onPress={stopSession}
            style={{
              position: 'absolute',
              bottom: 20,
              alignSelf: 'center',
              paddingVertical: 10,
              paddingHorizontal: 20,
              backgroundColor: 'red',
              borderRadius: 5,
            }}
          >
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Oturumu Durdur</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
} 