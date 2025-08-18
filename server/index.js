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

  try {
    // 1) Geçerli avatar_id bul (istekte geldiyse onu kullan, yoksa listeden ACTIVE seç)
    let avatarId = req.body?.avatarId;
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
      console.log('Using ACTIVE avatar_id:', avatarId);
    }

    // (İsteğe bağlı) voiceId geldi ise doğru şemayla ekle
    const bodyObj = {
      avatar_id: avatarId,
      ...(req.body?.voiceId ? { voice: { voice_id: req.body.voiceId } } : {})
      // İstersen: quality: 'high', video_encoding: 'H264'
    };

    const bodyStr = JSON.stringify(bodyObj);
    console.log('streaming.new request body:', bodyStr);

    // 2) NEW SESSION
    const initResp = await fetch(`${HEYGEN_BASE}/v1/streaming.new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY,
      },
      body: bodyStr
    });

    const initText = await initResp.text();
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

    // Frontend’in beklediği alan adları (geriye dönük uyumluluk için sessionUrl veriyoruz)
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
    res.json({ message: 'Session stopped successfully', raw: stopJson });
  } catch (error) {
    console.error('Error stopping HeyGen session', error);
    res.status(500).json({ error: error?.message || 'Unknown error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HeyGen pilot backend listening on http://0.0.0.0:${PORT}`);
});
