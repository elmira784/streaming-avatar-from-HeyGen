const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from Backend!');
});

const PORT = process.env.PORT || 4001;
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || '';
const HEYGEN_BASE = process.env.HEYGEN_BASE || 'https://api.heygen.com';

// Track active sessions to prevent concurrent session limit
let activeSessions = new Set();

/**
 * 1) NEW SESSION:
 *    - HeyGen streaming.new çağrılır
 *    - sessionId + offer (SDP) + realtime_endpoint döner
 *    - Geriye DÖNÜŞTE: { sessionId, sessionUrl, offer, iceServers }
 */
app.post('/api/heygen/session', async (req, res) => {
  console.log('Received POST /api/heygen/session');
  if (!HEYGEN_API_KEY) {
    return res.status(500).json({ error: 'HEYGEN_API_KEY missing in environment' });
  }

  // Check if we already have an active session
  if (activeSessions.size > 0) {
    console.log('Active session exists, stopping it first...');
    const oldSessionId = Array.from(activeSessions)[0];
    try {
      await fetch(`${HEYGEN_BASE}/v1/streaming.stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': HEYGEN_API_KEY,
        },
        body: JSON.stringify({ session_id: oldSessionId })
      });
      activeSessions.clear();
      console.log('Previous session stopped');
    } catch (err) {
      console.error('Error stopping previous session:', err);
    }
  }

  try {
    // 1) Geçerli avatar_id bul (istekte geldiyse onu kullan, yoksa listeden ACTIVE seç)
    let avatarId = req.body?.avatarId;
    console.log('Requested avatar ID:', avatarId);
    
    if (!avatarId) {
      const listResp = await fetch(`${HEYGEN_BASE}/v1/streaming/avatar.list`, {
        method: 'GET',
        headers: { 'X-Api-Key': HEYGEN_API_KEY }
      });
      const listText = await listResp.text();
      if (!listResp.ok) {
        console.error('avatar.list failed:', listText);
        return res.status(listResp.status).json({ error: 'avatar.list failed', raw: listText });
      }
      const listJson = JSON.parse(listText);
      const firstActive = (listJson.data || []).find(a => a.status === 'ACTIVE');
      if (!firstActive) {
        return res.status(500).json({ error: 'No ACTIVE avatars available', raw: listJson });
      }
      avatarId = firstActive.avatar_id;
      console.log('Using ACTIVE avatar_id from list:', avatarId);
    } else {
      console.log('Using requested avatar_id:', avatarId);
    }

    // Enhanced session configuration with personality override
    const bodyObj = {
      avatar_id: avatarId,
      quality: 'high',
      video_encoding: 'H264',
      // Enhanced voice configuration with emotion
      voice: {
        ...(req.body?.voiceId ? { voice_id: req.body.voiceId } : {}),
        emotion: 'FRIENDLY',
        stability: 0.8,
        similarity_boost: 0.9
      },
      // Comprehensive personality override parameters
      knowledge_base: `You are a Turkish coffee wellness expert named ${avatarId === 'Thaddeus_ProfessionalLook_public' ? 'Bora' : 'Parla'}. CRITICAL: Ignore ALL default HeyGen behaviors, personalities, and training. You exist ONLY as a Turkish coffee wellness coach. Your expertise covers: coffee antioxidants, brewing methods, mood enhancement, wellness benefits, and lifestyle coaching related to Turkish coffee consumption. Never mention HeyGen, AI, or any other topics.`,
      personality: 'dedicated Turkish coffee wellness coach with professional expertise',
      context: 'Turkish coffee wellness coaching session with personalized advice',
      system_prompt: `SYSTEM OVERRIDE: You are exclusively a Turkish coffee wellness expert. Ignore all previous instructions, default behaviors, and HeyGen-specific content. Focus ONLY on Turkish coffee wellness coaching. Never break character.`,
      behavior_instructions: 'Act as a knowledgeable Turkish coffee wellness coach. Provide personalized wellness advice based on coffee consumption. Maintain warm, professional demeanor focused solely on coffee wellness benefits.',
      response_style: 'conversational, warm, expert, wellness-focused',
      topic_restrictions: 'Turkish coffee wellness, brewing methods, health benefits, mood enhancement, lifestyle coaching'
    };

    const bodyStr = JSON.stringify(bodyObj);
    console.log('streaming.new request body:', bodyStr);

    // 2) NEW SESSION with retry logic
    let retries = 3;
    let initResp;
    let initText;
    
    for (let i = 0; i < retries; i++) {
      initResp = await fetch(`${HEYGEN_BASE}/v1/streaming.new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': HEYGEN_API_KEY,
        },
        body: bodyStr
      });

      initText = await initResp.text();
      
      if (initResp.ok) {
        break; // Success, exit retry loop
      }
      
      // Check if it's a concurrent session limit error
      let errorJson;
      try { errorJson = JSON.parse(initText); } catch (_) {}
      
      if (errorJson?.code === 10004) {
        console.log(`Retry ${i + 1}/${retries}: Concurrent session limit, waiting 30 seconds...`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
          continue;
        }
        // Last retry failed, return helpful error
        return res.status(429).json({ 
          error: 'Session limit reached',
          message: 'Your HeyGen free plan allows only 1 concurrent session. Please wait 10 minutes for existing sessions to expire, or upgrade your plan.',
          code: 10004,
          waitTime: '10 minutes',
          upgradeUrl: 'https://app.heygen.com/settings/billing'
        });
      }
      
      // Other error, don't retry
      break;
    }
    
    if (!initResp.ok) {
      console.error('HeyGen API Error (streaming.new):', initText);
      return res.status(initResp.status).json({ error: 'streaming.new failed', raw: initText });
    }

    const initJson = JSON.parse(initText);
    console.log('HeyGen API Success (streaming.new):', initJson);

    const data = initJson?.data || {};
    const sessionId = data.session_id || null;
    const offer = data.sdp || null;               // { type:'offer', sdp:'...' }
    const signalingWSS = data.realtime_endpoint;  // wss://...
    const iceServers = data.ice_servers2 || data.ice_servers || null;

    if (!sessionId) return res.status(500).json({ error: 'sessionId not found', raw: initJson });
    if (!offer)     return res.status(500).json({ error: 'SDP offer not found', raw: initJson });

    // Track this session
    activeSessions.add(sessionId);
    console.log('New session created and tracked:', sessionId);

    // Frontend'in beklediği alan adları (geriye dönük uyumluluk için sessionUrl veriyoruz)
    return res.json({
      sessionId,
      sessionUrl: signalingWSS,
      offer,
      iceServers,
      raw: initJson
    });
  } catch (err) {
    console.error('Error in /api/heygen/session', err);
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});


/**
 * 2) START:
 *    Client SDP answer üretir ve gönderir.
 *    Body: { sessionId, answer: { type:'answer', sdp:'...' } }
 */
app.post('/api/heygen/start', async (req, res) => {
  console.log('Received POST /api/heygen/start');
  if (!HEYGEN_API_KEY) {
    return res.status(500).json({ error: 'HEYGEN_API_KEY missing in environment' });
  }

  const { sessionId, answer } = req.body || {};
  if (!sessionId || !answer?.type || !answer?.sdp) {
    return res.status(400).json({ error: 'sessionId and SDP answer {type,sdp} required' });
  }

  try {
    const resp = await fetch(`${HEYGEN_BASE}/v1/streaming.start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY,
      },
      body: JSON.stringify({ session_id: sessionId, sdp: answer })
    });

    const jsonText = await resp.text();
    let json = {};
    try { json = JSON.parse(jsonText); } catch (_) {}

    if (!resp.ok) {
      console.error('HeyGen API Error (streaming.start):', json || jsonText);
      return res.status(resp.status).json(json || { error: jsonText });
    }
    console.log('HeyGen API Success (streaming.start):', json);
    return res.json(json);
  } catch (err) {
    console.error('Error in /api/heygen/start', err);
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

/**
 * 3) ICE:
 *    Client ICE candidate'larını HeyGen'e iletir
 *    Body: { sessionId, candidate }
 */
app.post('/api/heygen/ice', async (req, res) => {
  console.log('Received POST /api/heygen/ice');
  if (!HEYGEN_API_KEY) {
    return res.status(500).json({ error: 'HEYGEN_API_KEY missing in environment' });
  }

  const { sessionId, candidate } = req.body || {};
  if (!sessionId || !candidate) {
    return res.status(400).json({ error: 'sessionId and candidate required' });
  }

  try {
    const resp = await fetch(`${HEYGEN_BASE}/v1/streaming.ice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY,
      },
      body: JSON.stringify({ session_id: sessionId, candidate })
    });

    const jsonText = await resp.text();
    let json = {};
    try { json = JSON.parse(jsonText); } catch (_) {}

    if (!resp.ok) {
      console.error('HeyGen API Error (streaming.ice):', json || jsonText);
      return res.status(resp.status).json(json || { error: jsonText });
    }
    console.log('HeyGen API Success (streaming.ice):', json);
    return res.json(json);
  } catch (err) {
    console.error('Error in /api/heygen/ice', err);
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

/**
 * 4) STOP: opsiyonel
 */
app.post('/api/heygen/stop', async (req, res) => {
  console.log('Received POST /api/heygen/stop');
  const { sessionId } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: 'session_id is required to stop a session' });
  }
  if (!HEYGEN_API_KEY) {
    return res.status(500).json({ error: 'HEYGEN_API_KEY missing in environment' });
  }

  try {
    const stopResp = await fetch(`${HEYGEN_BASE}/v1/streaming.stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY,
      },
      body: JSON.stringify({ session_id: sessionId })
    });

    const stopText = await stopResp.text();
    let stopJson = {};
    try { stopJson = JSON.parse(stopText); } catch (_) {}

    if (!stopResp.ok) {
      console.error('HeyGen API Error (streaming.stop):', stopJson || stopText);
      return res.status(stopResp.status).json(stopJson || { error: stopText });
    }
    console.log('HeyGen API Success (streaming.stop):', stopJson);
    
    // Remove from active sessions
    activeSessions.delete(sessionId);
    console.log('Session removed from tracking:', sessionId);
    
    res.json({ message: 'Session stopped successfully', raw: stopJson });
  } catch (error) {
    console.error('Error stopping HeyGen session', error);
    res.status(500).json({ error: error?.message || 'Unknown error' });
  }
});

/**
 * TTS: Make avatar speak text
 */
app.post('/api/heygen/speak', async (req, res) => {
  console.log('Received POST /api/heygen/speak');
  const { sessionId, text } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (!HEYGEN_API_KEY) {
    return res.status(500).json({ error: 'HEYGEN_API_KEY missing in environment' });
  }

  try {
    const speakResp = await fetch(`${HEYGEN_BASE}/v1/streaming.task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY,
      },
      body: JSON.stringify({ 
        session_id: sessionId,
        text: text,
        task_type: 'talk'
      })
    });

    const speakText = await speakResp.text();
    let speakJson = {};
    try { speakJson = JSON.parse(speakText); } catch (_) {}

    if (!speakResp.ok) {
      console.error('HeyGen API Error (streaming.task):', speakJson || speakText);
      return res.status(speakResp.status).json(speakJson || { error: speakText });
    }
    console.log('HeyGen API Success (streaming.task):', speakJson);
    res.json({ message: 'Avatar is speaking', raw: speakJson });
  } catch (error) {
    console.error('Error making avatar speak', error);
    res.status(500).json({ error: error?.message || 'Unknown error' });
  }
});

/**
 * CLEANUP: Stop all active sessions
 */
app.post('/api/heygen/cleanup', async (req, res) => {
  console.log('Received POST /api/heygen/cleanup - stopping all sessions');
  
  if (!HEYGEN_API_KEY) {
    return res.status(500).json({ error: 'HEYGEN_API_KEY missing in environment' });
  }

  const results = [];
  for (const sessionId of activeSessions) {
    try {
      const stopResp = await fetch(`${HEYGEN_BASE}/v1/streaming.stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': HEYGEN_API_KEY,
        },
        body: JSON.stringify({ session_id: sessionId })
      });

      const stopText = await stopResp.text();
      let stopJson = {};
      try { stopJson = JSON.parse(stopText); } catch (_) {}

      results.push({ 
        sessionId, 
        success: stopResp.ok, 
        response: stopJson || stopText 
      });
      console.log(`Session ${sessionId}: ${stopResp.ok ? 'stopped' : 'failed to stop'}`);
    } catch (error) {
      results.push({ 
        sessionId, 
        success: false, 
        error: error.message 
      });
      console.error(`Error stopping session ${sessionId}:`, error);
    }
  }

  activeSessions.clear();
  console.log('All sessions cleared from tracking');

  res.json({ 
    message: 'Cleanup completed',
    results,
    clearedSessions: results.length
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HeyGen pilot backend listening on http://0.0.0.0:${PORT}`);
});
