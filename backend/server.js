/**
 * EchoTranslate - Backend Server
 * Copyright (c) 2025 EchoTranslate. All Rights Reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 * 
 * MIGRATION NOTES:
 * - Replaced Gemini Live API with OpenAI Realtime API
 * - Uses OpenAI Realtime for continuous speech transcription
 * - Maintains all existing features and session management
 * - Updated environment variable from GEMINI_API_KEY to OPENAI_API_KEY
 * 
 * This software contains proprietary and confidential information.
 * Unauthorized copying, modification, distribution, or use of this
 * software is strictly prohibited.
 * 
 * See LICENSE file for complete terms and conditions.
 */

import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import sessionStore from "./sessionStore.js";
import translationManager from "./translationManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Store active sessions for tracking
const activeSessions = new Map();

// Language code to full name mapping
const LANGUAGE_NAMES = {
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'pt-BR': 'Portuguese (Brazil)',
  'ru': 'Russian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'nl': 'Dutch',
  'pl': 'Polish',
  'tr': 'Turkish',
  'bn': 'Bengali',
  'vi': 'Vietnamese',
  'th': 'Thai',
  'id': 'Indonesian',
  'sv': 'Swedish',
  'no': 'Norwegian',
  'da': 'Danish',
  'fi': 'Finnish',
  'el': 'Greek',
  'cs': 'Czech',
  'ro': 'Romanian',
  'hu': 'Hungarian',
  'he': 'Hebrew',
  'uk': 'Ukrainian',
  'fa': 'Persian',
  'ur': 'Urdu',
  'ta': 'Tamil',
  'te': 'Telugu',
  'mr': 'Marathi',
  'gu': 'Gujarati',
  'kn': 'Kannada',
  'ml': 'Malayalam',
  'sw': 'Swahili',
  'fil': 'Filipino',
  'ms': 'Malay',
  'ca': 'Catalan',
  'sk': 'Slovak',
  'bg': 'Bulgarian',
  'hr': 'Croatian',
  'sr': 'Serbian',
  'lt': 'Lithuanian',
  'lv': 'Latvian',
  'et': 'Estonian',
  'sl': 'Slovenian',
  'af': 'Afrikaans'
};

// Create WebSocket server for clients
const wss = new WebSocketServer({ noServer: true });

// Create HTTP server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[Backend] Server running on port ${port}`);
  console.log(`[Backend] Local: http://localhost:${port}`);
  console.log(`[Backend] WebSocket: ws://localhost:${port}/translate`);
  console.log(`[Backend] For network access, use your local IP address instead of localhost`);
});

// Import WebSocket handlers
import { handleHostConnection } from './hostModeHandler.js';
import { handleListenerConnection } from './websocketHandler.js';
import { handleSoloMode } from './soloModeHandler.js';

// Handle WebSocket upgrades
server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/translate")) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Handle WebSocket connections
wss.on("connection", async (clientWs, req) => {
  console.log("[Backend] New WebSocket client connected");

  // Parse URL parameters
  const url = new URL(req.url, `http://localhost:${port}`);
  const role = url.searchParams.get('role'); // 'host' or 'listener'
  const sessionId = url.searchParams.get('sessionId');
  const targetLang = url.searchParams.get('targetLang');
  const userName = decodeURIComponent(url.searchParams.get('userName') || 'Anonymous');

  // Route to appropriate handler
  if (role === 'host' && sessionId) {
    handleHostConnection(clientWs, sessionId);
    return;
  } else if (role === 'listener' && sessionId) {
    handleListenerConnection(clientWs, sessionId, targetLang || 'en', userName);
    return;
  }

  // Fall back to solo mode for backward compatibility
  // UNIFIED: Now uses OpenAIRealtimePool just like host mode
  console.log("[Backend] Solo mode connection - using OpenAIRealtimePool");
  handleSoloMode(clientWs);
});

// ========================================
// SESSION MANAGEMENT ENDPOINTS
// ========================================

/**
 * POST /session/start
 * Creates a new live translation session for a host
 */
app.post('/session/start', (req, res) => {
  try {
    const { sessionId, sessionCode } = sessionStore.createSession();
    
    res.json({
      success: true,
      sessionId,
      sessionCode,
      wsUrl: `/translate?role=host&sessionId=${sessionId}`
    });
  } catch (error) {
    console.error('[Backend] Error creating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /session/join
 * Allows a listener to join an existing session
 */
app.post('/session/join', (req, res) => {
  try {
    const { sessionCode, targetLang, userName } = req.body;
    
    if (!sessionCode) {
      return res.status(400).json({
        success: false,
        error: 'Session code is required'
      });
    }
    
    const session = sessionStore.getSessionByCode(sessionCode);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found. Please check the code and try again.'
      });
    }
    
    if (!session.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Session is not active yet. The host needs to start broadcasting.'
      });
    }
    
    res.json({
      success: true,
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      sourceLang: session.sourceLang,
      targetLang: targetLang || 'en',
      wsUrl: `/translate?role=listener&sessionId=${session.sessionId}&targetLang=${targetLang || 'en'}&userName=${encodeURIComponent(userName || 'Anonymous')}`
    });
  } catch (error) {
    console.error('[Backend] Error joining session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /session/:sessionCode/info
 * Get session information
 */
app.get('/session/:sessionCode/info', (req, res) => {
  try {
    const { sessionCode } = req.params;
    const session = sessionStore.getSessionByCode(sessionCode);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    const stats = sessionStore.getSessionStats(session.sessionId);
    
    res.json({
      success: true,
      session: stats
    });
  } catch (error) {
    console.error('[Backend] Error getting session info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /sessions
 * Get all active sessions (for admin/debugging)
 */
app.get('/sessions', (req, res) => {
  try {
    const sessions = sessionStore.getAllSessions();
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: activeSessions.size,
    liveTranslationSessions: sessionStore.getAllSessions().length,
    model: 'gpt-realtime',
    apiProvider: 'OpenAI',
    endpoint: '/translate'
  });
});

// Test translation endpoint (using OpenAI Chat API)
// MIGRATION NOTE: Replaced Gemini API with OpenAI Chat Completions API
app.post('/test-translation', async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    
    const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang || 'auto-detect';
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang || 'English';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate from ${sourceLangName} to ${targetLangName}. Output only the translation, no explanations.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`Translation request failed: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const translatedText = result.choices?.[0]?.message?.content?.trim() || '';

    res.json({
      originalText: text,
      translatedText: translatedText,
      sourceLang: sourceLangName,
      targetLang: targetLangName
    });
  } catch (error) {
    console.error('Test translation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// MIGRATION NOTE: Updated startup messages for OpenAI Realtime
console.log("[Backend] Starting OpenAI Realtime Translation Server...");
console.log("[Backend] WebSocket endpoint: ws://localhost:" + port + "/translate");
console.log("[Backend] API Provider: OpenAI Realtime API");
console.log("[Backend] Model: gpt-realtime (latest)");
console.log("[Backend] API Key configured:", process.env.OPENAI_API_KEY ? 'Yes ✓' : 'No ✗ (ERROR!)');
if (!process.env.OPENAI_API_KEY) {
  console.error("[Backend] ERROR: OPENAI_API_KEY not found in environment variables!");
  console.error("[Backend] Please create a .env file with: OPENAI_API_KEY=your_api_key_here");
}
