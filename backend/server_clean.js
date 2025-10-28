/**
 * Exbabel - Backend Server
 * Copyright (c) 2025 Exbabel. All Rights Reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
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
dotenv.config();

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
import { handleHostConnection, handleListenerConnection } from './websocketHandler.js';
import { handleSoloMode } from './soloHandler.js';

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
      error: 'Failed to create session'
    });
  }
});

/**
 * POST /session/join
 * Allows a listener to join an existing session
 */
app.post('/session/join', (req, res) => {
  try {
    const { sessionCode, targetLang } = req.body;
    const sessionId = sessionStore.getSessionByCode(sessionCode);
    
    if (!sessionId) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    res.json({
      success: true,
      sessionId,
      targetLang: targetLang || 'en',
      wsUrl: `/translate?role=listener&sessionId=${sessionId}&targetLang=${targetLang || 'en'}`
    });
  } catch (error) {
    console.error('[Backend] Error joining session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join session'
    });
  }
});

/**
 * GET /session/:sessionId/status
 * Get the status of a session
 */
app.get('/session/:sessionId/status', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessionStore.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    res.json({
      success: true,
      status: session.status,
      listenerCount: session.listeners.size,
      translationCount: translationManager.getTranslationCount(sessionId)
    });
  } catch (error) {
    console.error('[Backend] Error getting session status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session status'
    });
  }
});

/**
 * POST /session/:sessionId/end
 * End a session
 */
app.post('/session/:sessionId/end', (req, res) => {
  try {
    const { sessionId } = req.params;
    sessionStore.endSession(sessionId);
    
    res.json({
      success: true,
      message: 'Session ended'
    });
  } catch (error) {
    console.error('[Backend] Error ending session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end session'
    });
  }
});

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeConnections: wss.clients.size,
    activeSessions: sessionStore.getActiveSessions().length
  });
});

console.log('[Backend] Starting Gemini Realtime Translation Server...');
console.log(`[Backend] WebSocket endpoint: ws://localhost:${port}/translate`);
console.log(`[Backend] API Key configured: ${process.env.GEMINI_API_KEY ? 'Yes ✓' : 'No ✗'}`);

