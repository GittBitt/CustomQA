import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import fetch, { FormData, Blob } from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const EXTENSION_ID = process.env.EXTENSION_ID;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const API_KEY = process.env.FIREBASE_API_KEY;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
});

// CORS - only allow your extension
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else if (origin === 'https://customqa.onrender.com') {
      callback(null, true); // Allow localhost for testing
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Microphone audio is sent as base64 data URLs; increase body limit to avoid 413 payload errors.
app.use(express.json({ limit: '25mb' }));

// Request logger to confirm traffic is reaching this deployed service.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    console.log(`[REQ] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`);
  });
  next();
});

// ==================== MIDDLEWARE ====================

// Verify Firebase ID token via REST API
async function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    console.warn('[Token] No token provided in Authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    console.log('[Token] Verifying token:', `${token.substring(0, 20)}...`);
    
    // Verify token via Firebase REST API
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://customqa.onrender.com',  // Required by Firebase
          'User-Agent': 'CustomQA-Backend/1.0'  // Identify as backend
        },
        body: JSON.stringify({ idToken: token })
      }
    );

    console.log('[Token] Firebase response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Token] Firebase verification failed:', {
        status: response.status,
        error: errorData.error?.message || errorData.error || 'Unknown error'
      });
      throw new Error(`Firebase error: ${errorData.error?.message || 'Invalid token'}`);
    }

    const data = await response.json();
    if (!data.users || data.users.length === 0) {
      console.error('[Token] No user found in Firebase response');
      throw new Error('No user found');
    }
    
    const user = data.users[0];
    console.log('[Token] User verified:', user.email);
    
    req.user = {
      uid: user.localId,
      email: user.email
    };
    next();
  } catch (error) {
    console.error('[Token] Verification error:', error.message);
    res.status(401).json({ error: 'Token verification failed: ' + error.message });
  }
}

// ==================== FIRESTORE HELPER ====================

// Call Firestore REST API
async function firestoreCall(method, path, body = null, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents${path}?key=${API_KEY}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      'Referer': 'https://customqa.onrender.com',
      'User-Agent': 'CustomQA-Backend/1.0'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Firestore error: ${response.status}`);
  }
  
  return response.json();
}

// Helper to convert JS value to Firestore format
function toFirestore(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestore) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestore(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

// Helper to convert Firestore value to JS
function fromFirestore(value) {
  if (value.stringValue) return value.stringValue;
  if (value.integerValue) return parseInt(value.integerValue);
  if (value.doubleValue) return parseFloat(value.doubleValue);
  if (value.booleanValue) return value.booleanValue;
  if (value.nullValue) return null;
  if (value.arrayValue) {
    return value.arrayValue.values?.map(fromFirestore) || [];
  }
  if (value.mapValue) {
    const obj = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
      obj[k] = fromFirestore(v);
    }
    return obj;
  }
  return value;
}

// Helper to sanitize JSON with escaped newlines within strings
// Handles literal newlines inside JSON string values by escaping them properly
// Uses a character-by-character state machine to properly track whether we're inside a string
function sanitizeJsonWithEscapedNewlines(jsonString) {
  let result = '';
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];
    
    if (escaped) {
      // If previous char was backslash, this char is escaped, add both
      result += char;
      escaped = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      // This is an escape character inside a string
      result += char;
      escaped = true;
      continue;
    }
    
    if (char === '"' && !escaped) {
      // Toggle string state
      inString = !inString;
      result += char;
      continue;
    }
    
    // If we're inside a string and hit a literal newline, escape it
    if (inString && (char === '\n' || char === '\r' || char === '\t')) {
      if (char === '\n') result += '\\n';
      else if (char === '\r') result += '\\r';
      else if (char === '\t') result += '\\t';
      continue;
    }
    
    result += char;
  }
  
  return result;
}

// Extract first JSON array/object from model output, even if wrapped with prose/markdown.
function extractFirstJsonPayload(text) {
  if (!text || typeof text !== 'string') return null;

  const withoutFences = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();

  const starts = ['[', '{'];
  for (const startChar of starts) {
    const startIdx = withoutFences.indexOf(startChar);
    if (startIdx === -1) continue;

    let inString = false;
    let escaped = false;
    let depth = 0;

    for (let i = startIdx; i < withoutFences.length; i++) {
      const ch = withoutFences[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === startChar) depth++;
      if ((startChar === '[' && ch === ']') || (startChar === '{' && ch === '}')) {
        depth--;
        if (depth === 0) {
          return withoutFences.slice(startIdx, i + 1).trim();
        }
      }
    }

    // If response is truncated, return from start to end as best-effort payload.
    return withoutFences.slice(startIdx).trim();
  }

  return withoutFences;
}

// Best-effort repair for truncated JSON by closing unterminated arrays/objects.
function repairTruncatedJson(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') return jsonString;

  let inString = false;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < jsonString.length; i++) {
    const ch = jsonString[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack.length > 0) stack.pop();
  }

  let repaired = jsonString;
  if (inString) repaired += '"';
  while (stack.length > 0) repaired += stack.pop();
  return repaired;
}

// ==================== FIRESTORE ENDPOINTS ====================

// Get user settings
app.get('/api/settings/:type', verifyToken, async (req, res) => {
  try {
    const { type } = req.params;
    const path = `/users/${req.user.uid}/settings/${type}`;
    
    const doc = await firestoreCall('GET', path, null, req.headers.authorization.split('Bearer ')[1]);
    
    if (doc.fields) {
      const settings = {};
      for (const [k, v] of Object.entries(doc.fields)) {
        settings[k] = fromFirestore(v);
      }
      res.json(settings);
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save user settings
app.post('/api/settings/:type', verifyToken, async (req, res) => {
  try {
    const { type } = req.params;
    const idToken = req.headers.authorization.split('Bearer ')[1];
    
    const fields = {};
    for (const [k, v] of Object.entries(req.body)) {
      fields[k] = toFirestore(v);
    }
    fields.updatedAt = { timestampValue: new Date().toISOString() };

    const path = `/users/${req.user.uid}/settings/${type}`;
    await firestoreCall('PATCH', path, { fields }, idToken);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save video AD
app.post('/api/videos/ad', verifyToken, async (req, res) => {
  try {
    const { videoUrl, videoLength, customizations, generatedAds } = req.body;
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const videoId = Buffer.from(videoUrl).toString('base64').replace(/[+/=]/g, '');

    const fields = {
      videoUrl: toFirestore(videoUrl),
      videoLength: toFirestore(videoLength),
      customizations: toFirestore(customizations),
      generatedAds: toFirestore(generatedAds),
      adCreatedAt: { timestampValue: new Date().toISOString() }
    };

    const path = `/users/${req.user.uid}/videos/${videoId}`;
    await firestoreCall('PATCH', path, { fields }, idToken);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving AD:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load video AD
app.get('/api/videos/ad/:videoId', verifyToken, async (req, res) => {
  try {
    const { videoId } = req.params;
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const path = `/users/${req.user.uid}/videos/${videoId}`;
    
    const doc = await firestoreCall('GET', path, null, idToken);
    
    if (doc.fields) {
      const data = {};
      for (const [k, v] of Object.entries(doc.fields)) {
        data[k] = fromFirestore(v);
      }
      res.json(data);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('Error loading AD:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save video VQA
app.post('/api/videos/vqa', verifyToken, async (req, res) => {
  try {
    const { videoUrl, videoLength, customizations, messages } = req.body;
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const videoId = Buffer.from(videoUrl).toString('base64').replace(/[+/=]/g, '');

    const fields = {
      videoUrl: toFirestore(videoUrl),
      videoLength: toFirestore(videoLength),
      customizations: toFirestore(customizations),
      vqaMessages: toFirestore(messages),
      vqaUpdatedAt: { timestampValue: new Date().toISOString() }
    };

    const path = `/users/${req.user.uid}/videos/${videoId}`;
    await firestoreCall('PATCH', path, { fields }, idToken);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving VQA:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load video VQA
app.get('/api/videos/vqa/:videoId', verifyToken, async (req, res) => {
  try {
    const { videoId } = req.params;
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const path = `/users/${req.user.uid}/videos/${videoId}`;
    
    const doc = await firestoreCall('GET', path, null, idToken);
    
    if (doc.fields?.vqaMessages) {
      const data = fromFirestore(doc.fields.vqaMessages);
      res.json(Array.isArray(data) ? data : []);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error loading VQA:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== API CALL ENDPOINTS ====================

// Call Gemini
app.post('/api/call-gemini', verifyToken, async (req, res) => {
  try {
    const { text, frames, options } = req.body;
    const videoUrl = options?.videoUrl;
    const isAdRequest = Array.isArray(options?.segments) && options.segments.length > 0;
    
    console.log(`[Gemini API] Called by user ${req.user.uid}`);
    console.log('[Gemini] Request mode:', isAdRequest ? 'AD(JSON expected)' : 'General(text expected)');
    if (videoUrl) {
      console.log('[Gemini] Video URL provided:', videoUrl);
    }
    
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Missing text prompt' });
    }

    // For AD generation, send only video URL grounding + text prompt.
    // Do not send segment objects as frames; those are already encoded in prompt text.
    const textOnlyParts = [{ text }];
    const urlGroundedParts = [...textOnlyParts];
    if (videoUrl && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(videoUrl)) {
      urlGroundedParts.unshift({
        fileData: {
          mimeType: 'video/x-youtube',
          fileUri: videoUrl
        }
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_GEMINI_API_KEY}`;
    console.log('[Gemini] Request URL:', geminiUrl.split('?')[0] + '?key=***');

    const buildRequestBody = (parts, useJsonMime) => ({
      contents: [{ parts }],
      generationConfig: {
        temperature: isAdRequest ? 0.4 : 0.7,
        topP: 0.95,
        maxOutputTokens: isAdRequest ? 8192 : 1024,
        ...(useJsonMime && isAdRequest ? { responseMimeType: 'application/json' } : {})
      }
    });

    let response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildRequestBody(urlGroundedParts, true))
    });

    // Some requests reject URL-grounding args. Retry as text-only to keep AD generation working.
    if (!response.ok && response.status === 400) {
      const firstError = await response.text();
      if (firstError.includes('INVALID_ARGUMENT')) {
        console.warn('[Gemini] URL-grounded request rejected; retrying text-only');
        response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(buildRequestBody(textOnlyParts, false))
        });
      } else {
        console.error('[Gemini] Error response:', firstError);
        throw new Error(`Gemini API error: 400 - ${firstError}`);
      }
    }

    console.log('[Gemini] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[Gemini] Error response:', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    
    console.log('[Gemini] Raw response starts with:', result.substring(0, 50));

    // Only enforce JSON parsing for AD generation requests.
    if (!isAdRequest) {
      res.json({ success: true, result });
      return;
    }

    let jsonContent = extractFirstJsonPayload(result);
    console.log('[Gemini] After JSON extraction, starts with:', jsonContent?.substring(0, 50));

    jsonContent = sanitizeJsonWithEscapedNewlines(jsonContent || '');
    console.log('[Gemini] After JSON sanitization');

    try {
      const parsed = JSON.parse(jsonContent);
      const normalized = Array.isArray(parsed)
        ? parsed
        : (parsed?.audio_descriptions || parsed?.VideoMetadata?.audio_descriptions || []);

      if (!Array.isArray(normalized)) {
        throw new Error('Expected JSON array or audio_descriptions array');
      }

      console.log('[Gemini] Valid JSON response, entries:', normalized.length);
      res.json({ success: true, result: JSON.stringify(normalized) });
    } catch (parseError) {
      // Retry parse once with best-effort repair for truncated model output.
      try {
        const repaired = repairTruncatedJson(jsonContent || '');
        const reparsed = JSON.parse(repaired);
        const normalized = Array.isArray(reparsed)
          ? reparsed
          : (reparsed?.audio_descriptions || reparsed?.VideoMetadata?.audio_descriptions || []);

        if (Array.isArray(normalized)) {
          console.warn('[Gemini] Parsed repaired JSON response, entries:', normalized.length);
          res.json({ success: true, result: JSON.stringify(normalized) });
          return;
        }
      } catch (repairError) {
        console.error('[Gemini] JSON repair failed:', repairError.message);
      }

      console.error('[Gemini] Failed to parse JSON:', parseError.message);
      console.error('[Gemini] Content being parsed:', (jsonContent || '').substring(0, 300));
      res.status(400).json({
        success: false,
        error: `Failed to parse Gemini response as JSON: ${parseError.message}`
      });
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Call Whisper
app.post('/api/call-whisper', verifyToken, async (req, res) => {
  try {
    const { audioBlob, settings } = req.body;
    
    console.log(`[Whisper API] Called by user ${req.user.uid}`);
    
    if (!audioBlob || typeof audioBlob !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid audioBlob payload' });
    }

    const commaIndex = typeof audioBlob === 'string' ? audioBlob.indexOf(',') : -1;
    const dataUrlHeader = commaIndex > -1 ? audioBlob.slice(0, commaIndex) : '';
    const rawMimeType = dataUrlHeader.startsWith('data:')
      ? dataUrlHeader.slice(5).split(';')[0]
      : 'audio/webm';
    const detectedMimeType = (rawMimeType || 'audio/webm').toLowerCase();
    const base64Audio = commaIndex > -1 ? audioBlob.slice(commaIndex + 1) : audioBlob;
    const audioBuffer = Buffer.from(base64Audio, 'base64');

    const extensionByMime = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/x-wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a'
    };
    const mimeForLookup = detectedMimeType.split(';')[0].trim();
    const fileExtension = extensionByMime[mimeForLookup] || 'webm';
    
    // Create FormData manually for node-fetch
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mimeForLookup }), `audio.${fileExtension}`);
    formData.append('model', 'whisper-1');
    formData.append('language', settings?.language || 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    res.json({ success: true, text: data.text });
  } catch (error) {
    console.error('Whisper API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Call TTS
app.post('/api/call-tts', verifyToken, async (req, res) => {
  try {
    const { text, voice, speed } = req.body;
    
    console.log(`[TTS API] Called by user ${req.user.uid}`);
    
    // Normalize UI slider speed (0-100) to OpenAI speed (0.25-4.0) with 50 => 1.0.
    let normalizedSpeed = 1.0;
    if (typeof speed === 'number') {
      if (speed <= 50) {
        normalizedSpeed = 0.25 + (speed / 50) * (1.0 - 0.25);
      } else {
        normalizedSpeed = 1.0 + ((speed - 50) / 50) * (4.0 - 1.0);
      }
      normalizedSpeed = Math.max(0.25, Math.min(4.0, normalizedSpeed));
    }
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice || 'nova',
        speed: normalizedSpeed
      })
    });

    if (!response.ok) throw new Error(`TTS API error: ${response.status}`);

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

    res.json({ success: true, audioUrl });
  } catch (error) {
    console.error('TTS API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== AUTH ENDPOINTS (Firebase proxy) ====================

// Refresh Firebase ID token (replaces securetoken.googleapis.com call from extension)
app.post('/api/auth/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Missing refreshToken' });
    }

    console.log('[Auth] Refreshing token...');
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[Auth] Refresh failed:', data);
      return res.status(401).json({ error: data.error?.message || 'Token refresh failed' });
    }

    if (!data.id_token) {
      console.error('[Auth] No id_token in response:', data);
      return res.status(401).json({ error: 'No id_token in response' });
    }

    const expiresInSeconds = parseInt(data.expires_in || '3600', 10);
    const expiresAt = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;

    console.log('[Auth] Token refreshed successfully');
    res.json({
      idToken: data.id_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt,
      expiresIn: expiresInSeconds
    });
  } catch (error) {
    console.error('[Auth] Error refreshing token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sign up with email/password (replaces identitytoolkit.googleapis.com call from extension)
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    console.log('[Auth] Signup request for:', email);
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true
        })
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[Auth] Signup failed:', data);
      return res.status(response.status).json({ 
        error: data.error?.message || 'Signup failed' 
      });
    }

    console.log('[Auth] User signed up:', email);
    const expiresInSeconds = parseInt(data.expiresIn || '3600', 10);
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    res.json({
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      uid: data.localId,
      email: data.email,
      expiresAt,
      expiresIn: expiresInSeconds
    });
  } catch (error) {
    console.error('[Auth] Error signing up:', error);
    res.status(500).json({ error: error.message });
  }
});

// Log in with email/password (replaces identitytoolkit.googleapis.com call from extension)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    console.log('[Auth] Login request for:', email);
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true
        })
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[Auth] Login failed:', data);
      return res.status(response.status).json({
        error: data.error?.message || 'Login failed'
      });
    }

    console.log('[Auth] User logged in:', email);
    const expiresInSeconds = parseInt(data.expiresIn || '3600', 10);
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    res.json({
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      uid: data.localId,
      email: data.email,
      expiresAt,
      expiresIn: expiresInSeconds
    });
  } catch (error) {
    console.error('[Auth] Error logging in:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`CustomQA Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
