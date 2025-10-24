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
import { handleHostConnection, handleListenerConnection } from './websocketHandler.js';
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
  // OLD INLINE SOLO MODE CODE REMOVED
  // Now using handleSoloMode() which uses OpenAIRealtimePool (same as host mode)
});

// ========================================
// SESSION MANAGEMENT ENDPOINTS
// ========================================

