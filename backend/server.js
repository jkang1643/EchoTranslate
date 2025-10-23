/**
 * EchoTranslate - Backend Server
 * Copyright (c) 2025 EchoTranslate. All Rights Reserved.
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

  // Fall back to legacy solo mode for backward compatibility
  console.log("[Backend] Legacy solo mode connection");

  let geminiWs = null;
  let legacySessionId = null;
  let currentSourceLang = 'en';
  let currentTargetLang = 'es';
  let reconnecting = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  let messageQueue = [];
  
  // State management for multi-turn streaming
  let isStreamingAudio = false;
  let setupComplete = false;
  let lastAudioTime = null;
  const AUDIO_END_TIMEOUT = 1000; // 1 second of silence to end turn
  let audioEndTimer = null;
  let maxStreamTimer = null;
  let streamStartTime = null;
  let maxStreamDuration = 3000; // Default 3 seconds
  let transcriptBuffer = ''; // Buffer for accumulating streaming transcript parts
  let audioGracePeriodTimer = null;
  const GRACE_PERIOD = 300; // Fixed 300ms grace period for audio end
  const EARLY_STOP_BUFFER = 500; // Stop 500ms early for complete capture
  
  // Intelligent transcript merging to handle overlaps (solo mode)
  let previousTranscript = '';
  const mergeTranscripts = (previous, current) => {
    if (!previous || !current) return current || previous || '';
    
    const prevWords = previous.trim().split(/\s+/);
    const currWords = current.trim().split(/\s+/);
    
    // Look for overlap up to 15 words
    const maxOverlap = Math.min(15, prevWords.length, currWords.length);
    
    for (let k = maxOverlap; k > 1; k--) {
      const prevTail = prevWords.slice(-k).join(' ');
      const currHead = currWords.slice(0, k).join(' ');
      
      // Case-insensitive comparison for better matching
      if (prevTail.toLowerCase() === currHead.toLowerCase()) {
        // Found overlap - merge by keeping previous + non-overlapping current
        const merged = prevWords.concat(currWords.slice(k)).join(' ');
        console.log(`[Backend] Merged with ${k}-word overlap: "${prevTail}"`);
        return merged;
      }
    }
    
    // No overlap found - concatenate with space
    return `${previous} ${current}`;
  };

  // Function to send audio stream end signal using realtimeInput API
  const sendAudioStreamEnd = () => {
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN && isStreamingAudio) {
      console.log('[Backend] Sending audioStreamEnd signal to close the audio stream');
      
      // According to the API docs, send realtimeInput with audioStreamEnd: true
      geminiWs.send(JSON.stringify({
        realtimeInput: {
          audioStreamEnd: true
        }
      }));
      
      isStreamingAudio = false;
      lastAudioTime = null;
      streamStartTime = null;
      
      // Clear all timers
      if (audioEndTimer) {
        clearTimeout(audioEndTimer);
        audioEndTimer = null;
      }
      if (maxStreamTimer) {
        clearTimeout(maxStreamTimer);
        maxStreamTimer = null;
      }
      if (audioGracePeriodTimer) {
        clearTimeout(audioGracePeriodTimer);
        audioGracePeriodTimer = null;
      }
    }
  };

  // Function to trigger graceful audio end with grace period
  const triggerGracefulAudioEnd = () => {
    if (isStreamingAudio) {
      console.log(`[Backend] Triggering graceful audio end with ${GRACE_PERIOD}ms grace period`);
      
      // Stop accepting new audio immediately
      isStreamingAudio = false;
      
      // Wait for grace period before sending audioStreamEnd
      audioGracePeriodTimer = setTimeout(() => {
        sendAudioStreamEnd();
      }, GRACE_PERIOD);
    }
  };

  // Function to attach event handlers to Gemini WebSocket
  const attachGeminiHandlers = (ws) => {
    ws.on("error", (error) => {
      console.error("[Backend] Gemini WebSocket error:", error.message || error);
      console.error("[Backend] Error details:", JSON.stringify(error, null, 2));
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: 'Gemini connection error: ' + (error.message || 'Unknown error')
        }));
      }
    });

    ws.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        console.log("[Backend] Gemini response:", JSON.stringify(response).substring(0, 200));

        // Handle setup complete message
        if (response.setupComplete) {
          console.log("[Backend] Gemini setup complete - ready for realtimeInput");
          setupComplete = true;
          
          // Process any queued messages now that setup is complete
          if (messageQueue.length > 0) {
            console.log(`[Backend] Processing ${messageQueue.length} queued messages after setup...`);
            const queuedMessages = [...messageQueue];
            messageQueue = [];
            
            queuedMessages.forEach(queued => {
              // Re-send through the message handler logic
              if (queued.type === 'text') {
                clientWs.emit('message', JSON.stringify(queued.message));
              } else if (queued.type === 'audio') {
                clientWs.emit('message', JSON.stringify(queued.message));
              }
            });
          }
          return;
        }

        // Process server content (model's response)
        if (response.serverContent) {
          const serverContent = response.serverContent;
          
          if (serverContent.modelTurn && serverContent.modelTurn.parts) {
            // Accumulate all parts into buffer
            serverContent.modelTurn.parts.forEach(part => {
              if (part.text) {
                transcriptBuffer += part.text;
              }
              
              if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.includes('audio')) {
                // Audio responses still sent immediately (not common in our use case)
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'audio_response',
                    audioData: part.inlineData.data,
                    mimeType: part.inlineData.mimeType,
                    timestamp: Date.now()
                  }));
                }
              }
            });
          }
          
          // Handle turn complete - send buffered translation
          if (serverContent.turnComplete) {
            console.log('[Backend] Model turn complete - ready for next user input');
            
            // Send complete buffered translation
            if (transcriptBuffer.trim() && clientWs.readyState === WebSocket.OPEN) {
              const currentTranscript = transcriptBuffer.trim();
              
              // For streaming mode, check for overlap with ONLY the last segment (not entire history)
              let finalTranscript = currentTranscript;
              
              if (previousTranscript) {
                // Try to detect overlap with the immediate previous segment
                const merged = mergeTranscripts(previousTranscript, currentTranscript);
                
                // Only use merged result if we found an actual overlap (merged is shorter than concat)
                if (merged.length < (previousTranscript.length + currentTranscript.length)) {
                  // Found overlap - extract only the NEW portion
                  const newPortion = merged.substring(previousTranscript.length).trim();
                  if (newPortion) {
                    finalTranscript = newPortion;
                    console.log(`[Backend] Detected overlap, sending only new portion: "${newPortion.substring(0, 50)}..."`);
                  }
                }
              }
              
              // Store this segment as the last one (for next overlap check)
              previousTranscript = currentTranscript;
              
              clientWs.send(JSON.stringify({
                type: 'translation',
                originalText: '',
                translatedText: finalTranscript,
                timestamp: Date.now()
              }));
              
              // Clear buffer for next turn
              transcriptBuffer = '';
            }
            
            // Clear any pending audio end timer
            if (audioEndTimer) {
              clearTimeout(audioEndTimer);
              audioEndTimer = null;
            }
            
            // Clear max stream timer
            if (maxStreamTimer) {
              clearTimeout(maxStreamTimer);
              maxStreamTimer = null;
            }
            
            // Reset streaming state for next turn
            isStreamingAudio = false;
            lastAudioTime = null;
            streamStartTime = null;
            
            // Notify client that model is ready for next input
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'turn_complete',
                timestamp: Date.now()
              }));
            }
          }
        }

        // Don't relay raw response - only send properly formatted JSON messages
      } catch (error) {
        console.error("[Backend] Error processing Gemini response:", error);
        // Send error message to client instead of raw data
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            message: 'Error processing translation response'
          }));
        }
      }
    });

    ws.on("close", async (code, reason) => {
      console.log(`[Backend] Gemini Realtime connection closed. Code: ${code}, Reason: ${reason || 'No reason provided'}`);
      console.log(`[Backend] Session ID: ${sessionId}, Reconnect attempts: ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      
      // Reset streaming state on disconnect
      isStreamingAudio = false;
      setupComplete = false;
      lastAudioTime = null;
      streamStartTime = null;
      transcriptBuffer = '';
      if (audioEndTimer) {
        clearTimeout(audioEndTimer);
        audioEndTimer = null;
      }
      if (maxStreamTimer) {
        clearTimeout(maxStreamTimer);
        maxStreamTimer = null;
      }
      if (audioGracePeriodTimer) {
        clearTimeout(audioGracePeriodTimer);
        audioGracePeriodTimer = null;
      }
      
      // Check for persistent quota errors
      if (code === 1011) {
        reconnectAttempts++;
        
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[Backend] ❌ PERSISTENT QUOTA ERROR - Stopping reconnection attempts');
          console.error('[Backend] Please verify:');
          console.error('[Backend] 1. Billing is enabled in Google Cloud Console');
          console.error('[Backend] 2. Using API key from Cloud Console (not AI Studio)');
          console.error('[Backend] 3. Correct project has billing enabled');
          
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'error',
              message: '❌ Persistent API Quota Error: Unable to connect after multiple attempts. Please check your billing setup and API key configuration.',
              code: 1011,
              persistent: true
            }));
          }
          return; // Stop trying
        }
        
        console.warn(`[Backend] ⚠️  Code 1011 received (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) - will retry...`);
      }
      
      // For 1007 errors (precondition failed), don't reconnect - this is likely a protocol issue
      if (code === 1007) {
        console.error('[Backend] ❌ Code 1007 (Precondition Failed) - Protocol issue detected');
        console.error('[Backend] This usually means the audio stream state is incorrect');
        console.error('[Backend] Will attempt reconnect with clean state...');
        // Continue to reconnect logic to try with fresh state
      }
      
      // Attempt to reconnect
      if (clientWs.readyState === WebSocket.OPEN && !reconnecting) {
        reconnecting = true;
        
        // Exponential backoff: 500ms, 1s, 2s, 4s
        const backoffDelay = Math.min(500 * Math.pow(2, reconnectAttempts), 4000);
        console.log(`[Backend] Attempting to reconnect in ${backoffDelay}ms...`);
        
        try {
          // Wait with exponential backoff
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          
          // Reconnect to Gemini
          geminiWs = await connectToGemini();
          
          // Re-attach all the event handlers
          attachGeminiHandlers(geminiWs);
          
          reconnecting = false;
          
          // Reset counter on successful connection (except for persistent quota errors)
          if (code !== 1011) {
            reconnectAttempts = 0;
          }
          
          console.log('[Backend] Successfully reconnected to Gemini - waiting for setupComplete...');
          
          // Messages will be processed when setupComplete is received
          // Don't process queue here to avoid sending before setup is complete
          
        } catch (error) {
          reconnecting = false;
          console.error('[Backend] Failed to reconnect to Gemini:', error);

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'error',
              message: 'Failed to reconnect to translation service'
        }));
      }
        }
      }
    });
  };

  // Function to connect/reconnect to Gemini
  const connectToGemini = () => {
    return new Promise((resolve, reject) => {
      console.log("[Backend] Connecting to Gemini Multimodal Live API...");
      
      // Correct Live API WebSocket endpoint - use v1beta (not v1alpha or v1beta1)
      const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
      const ws = new WebSocket(geminiWsUrl);
      
      ws.on("open", () => {
        console.log("[Backend] Connected to Gemini Realtime");
        
        const sourceLangName = LANGUAGE_NAMES[currentSourceLang] || currentSourceLang;
        const targetLangName = LANGUAGE_NAMES[currentTargetLang] || currentTargetLang;
        
        // Send initial setup configuration to Gemini
        // Live API requires generationConfig (not generation_config)
        const setupMessage = {
          setup: {
            model: "models/gemini-live-2.5-flash-preview",
            generationConfig: {
              responseModalities: ["TEXT"]
            },
            systemInstruction: {
              parts: [{
                text: `You are a professional real-time audio translator. You will receive audio input in ${sourceLangName} and must translate it to ${targetLangName}.

CRITICAL RULES:
1. ONLY provide the direct translation of the audio you hear
2. Do NOT ask for text or say "please provide text" - you receive AUDIO, not text requests
3. Do NOT include explanations like "The translation is..." or "Here's the translation"
4. Do NOT respond to translation instructions - just translate the audio content directly
5. If you hear speech, translate it immediately to ${targetLangName}
6. Preserve the meaning, tone, and context of the original speech
7. Maintain proper grammar and natural phrasing in ${targetLangName}

TRANSLATION QUALITY:
- Prioritize complete sentences when possible
- Maintain proper punctuation and sentence boundaries
- If audio cuts mid-sentence, translate what you hear accurately
- Do not add words or complete incomplete thoughts
- Use proper capitalization and punctuation marks (. ! ?)

Example: If you hear audio saying "Hello, how are you?" in ${sourceLangName}, respond ONLY with the ${targetLangName} translation, nothing else.`
              }]
            }
          }
        };
        
        ws.send(JSON.stringify(setupMessage));
        console.log(`[Backend] Sent setup configuration to Gemini (${sourceLangName} → ${targetLangName})`);
        
        resolve(ws);
      });
      
      ws.on("error", (error) => {
        console.error("[Backend] Gemini WebSocket connection error during setup:", error.message || error);
        reject(error);
      });
    });
  };

  // Step 1: Set up client message handler FIRST (before Gemini connection)
  // This ensures the client can receive error messages even if Gemini fails
    clientWs.on("message", (msg) => {
      try {
        const message = JSON.parse(msg.toString());
        console.log("[Backend] Client message:", message.type);

        // Handle different message types
        switch (message.type) {
          case 'init':
            // Update language preferences and reconnect if they changed
            const prevSourceLang = currentSourceLang;
            const prevTargetLang = currentTargetLang;
            
            if (message.sourceLang) {
              currentSourceLang = message.sourceLang;
            }
            if (message.targetLang) {
              currentTargetLang = message.targetLang;
            }
            
            if (message.maxStreamDuration) {
              maxStreamDuration = message.maxStreamDuration;
              console.log(`[Backend] Max stream duration updated to ${maxStreamDuration}ms`);
            }
            
            // Reset transcript history on init
            previousTranscript = '';
            
            const sourceLangName = LANGUAGE_NAMES[currentSourceLang] || currentSourceLang;
            const targetLangName = LANGUAGE_NAMES[currentTargetLang] || currentTargetLang;
            
            console.log(`[Backend] Language preferences updated: ${sourceLangName} → ${targetLangName}`);
            
            // If languages changed and we have an active connection, reconnect with new system instruction
            const languagesChanged = (prevSourceLang !== currentSourceLang) || (prevTargetLang !== currentTargetLang);
            if (languagesChanged && geminiWs && geminiWs.readyState === WebSocket.OPEN && setupComplete) {
              console.log('[Backend] Languages changed, reconnecting with new system instruction...');
              geminiWs.close();
              // The close handler will trigger reconnection with new languages
            }
            
            // Client is initializing - session already set up
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'session_ready',
                sessionId: sessionId,
                message: `Translation session ready: ${sourceLangName} → ${targetLangName}`
              }));
            }
            break;

          case 'text':
            // Send text to Gemini for translation
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
              const targetLangName = LANGUAGE_NAMES[message.targetLang || currentTargetLang] || message.targetLang || 'English';
              const sourceLangName = LANGUAGE_NAMES[message.sourceLang || currentSourceLang] || message.sourceLang || 'auto-detect';
              
              const textMessage = {
                clientContent: {
                  turns: [{
                    role: "user",
                  parts: [{
                      text: `Translate the following text from ${sourceLangName} to ${targetLangName}. Only provide the translation, nothing else:\n\n${message.text}`
                  }]
                  }],
                  turnComplete: true
                }
              };
              console.log(`[Backend] Translating text: ${sourceLangName} → ${targetLangName}`);
              geminiWs.send(JSON.stringify(textMessage));
            } else {
              // Queue message if reconnecting
              console.log('[Backend] Gemini reconnecting, queuing text message...');
              messageQueue.push({ type: 'text', message });
            }
            break;

          case 'audio':
            // Send audio to Gemini using realtimeInput API for proper streaming
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN && setupComplete) {
              // Log segment metadata if provided
              if (message.metadata) {
                const { duration, reason, overlapMs } = message.metadata;
                console.log(`[Backend] Audio segment: ${duration?.toFixed(0) || '?'}ms, reason: ${reason || 'unknown'}, overlap: ${overlapMs || 0}ms`);
              }
              
              const targetLangName = LANGUAGE_NAMES[message.targetLang || currentTargetLang] || message.targetLang || 'English';
              const sourceLangName = LANGUAGE_NAMES[message.sourceLang || currentSourceLang] || message.sourceLang || 'auto-detect';
              const isStreaming = message.streaming || false;
              
              // Track if we need to update system instruction for language change
              if (!isStreamingAudio) {
                console.log(`[Backend] Starting new audio stream: ${sourceLangName} → ${targetLangName}`);
                isStreamingAudio = true;
                streamStartTime = Date.now();
                
                // Apply pre-emptive stop: reduce by 500ms for buffer
                const userMaxDuration = maxStreamDuration;
                const actualMaxDuration = userMaxDuration - EARLY_STOP_BUFFER;
                console.log(`[Backend] Max stream duration: ${userMaxDuration}ms (using ${actualMaxDuration}ms with ${EARLY_STOP_BUFFER}ms buffer)`);
                
                maxStreamTimer = setTimeout(() => {
                  console.log('[Backend] Max stream duration reached, forcing cutoff');
                  triggerGracefulAudioEnd();
                }, actualMaxDuration);
              }
              
              // Send audio chunk using realtimeInput API with PCM format
              // PCM format is required - WebM is not supported
              // Specify sample rate: 16000 Hz, 16-bit, mono
              // NO separate text instruction - the system instruction handles translation
              const audioMessage = {
                realtimeInput: {
                  audio: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: message.audioData
                  }
                }
              };
              
              console.log(`[Backend] Sending audio chunk via realtimeInput.audio (streaming: ${isStreaming})`);
              geminiWs.send(JSON.stringify(audioMessage));
              
              // Track last audio time for silence detection
              lastAudioTime = Date.now();
              
              // Clear existing idle timer and set a new one (this resets on each audio chunk)
              if (audioEndTimer) {
                clearTimeout(audioEndTimer);
              }
              
              // If we haven't received more audio in AUDIO_END_TIMEOUT ms, end the stream
              audioEndTimer = setTimeout(() => {
                console.log('[Backend] Audio silence detected, sending audioStreamEnd');
                triggerGracefulAudioEnd();
              }, AUDIO_END_TIMEOUT);
              
            } else if (!setupComplete) {
              // Queue audio if setup not complete yet
              if (messageQueue.length < 10) {
                console.log('[Backend] Setup not complete, queuing audio message...');
                messageQueue.push({ type: 'audio', message });
              }
            } else {
              // Queue audio during reconnection (but limit queue size to avoid memory issues)
              if (messageQueue.length < 10) {
                console.log('[Backend] Gemini reconnecting, queuing audio message...');
                messageQueue.push({ type: 'audio', message });
              } else {
                console.log('[Backend] Message queue full, dropping audio chunk');
              }
            }
            break;
          
          case 'audio_end':
            // Client explicitly signals end of audio input
            console.log('[Backend] Client signaled audio end, completing turn');
            if (audioEndTimer) {
              clearTimeout(audioEndTimer);
              audioEndTimer = null;
            }
            if (maxStreamTimer) {
              clearTimeout(maxStreamTimer);
              maxStreamTimer = null;
            }
            triggerGracefulAudioEnd();
            
            // Reset transcript history when audio stream ends
            previousTranscript = '';
            break;

          default:
            // For other messages, relay directly to Gemini
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(msg);
            }
        }
      } catch (error) {
        console.error("[Backend] Error processing client message:", error);
      }
    });

  // Step 2: Handle client disconnects
    clientWs.on("close", () => {
      console.log("[Backend] Client disconnected");
      
      // Clean up any timers
      if (audioEndTimer) {
        clearTimeout(audioEndTimer);
        audioEndTimer = null;
      }
      
      if (maxStreamTimer) {
        clearTimeout(maxStreamTimer);
        maxStreamTimer = null;
      }
      
      if (audioGracePeriodTimer) {
        clearTimeout(audioGracePeriodTimer);
        audioGracePeriodTimer = null;
      }
      
      // Close Gemini connection
      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.close();
      }
      
      // Remove session
      if (legacySessionId) {
        activeSessions.delete(legacySessionId);
      }
      
      // Reset state
      isStreamingAudio = false;
      setupComplete = false;
      transcriptBuffer = '';
      messageQueue = [];
    });

  // Step 3: Now connect to Gemini (after client handlers are ready)
  (async () => {
    try {
      legacySessionId = `session_${Date.now()}`;
      console.log(`[Backend] Starting legacy session: ${legacySessionId}`);
      
      // Check if API key is configured
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured in environment variables');
      }
      
      geminiWs = await connectToGemini();
      console.log(`[Backend] Gemini connection established for session: ${legacySessionId}`);

      // Attach Gemini event handlers
      attachGeminiHandlers(geminiWs);

    // Store session for tracking
      activeSessions.set(legacySessionId, {
        clientWs,
        geminiWs,
        startTime: Date.now()
      });

      // Send session ready message to client
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'session_ready',
          sessionId: legacySessionId,
          message: 'Translation session ready'
        }));
    }

  } catch (err) {
    console.error("[Backend] Session initialization error:", err);
      console.error("[Backend] Error stack:", err.stack);
      
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'error',
          message: `Failed to initialize translation session: ${err.message}`
      }));
    }
  }
  })();
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
    model: 'gemini-1.5-flash',
    endpoint: '/translate'
  });
});

// Test translation endpoint (using regular Gemini API)
app.post('/test-translation', async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Translate this text from ${sourceLang || 'auto-detect'} to ${targetLang || 'English'}: "${text}"`
            }]
          }]
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Translation request failed: ${response.status}`);
    }

    const result = await response.json();
    let translatedText = '';

    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const content = result.candidates[0].content;
      if (content.parts) {
        translatedText = content.parts.map(part => part.text || '').join('');
      }
    }

    res.json({
      originalText: text,
      translatedText: translatedText.trim(),
      sourceLang: sourceLang || 'auto-detect',
      targetLang: targetLang || 'English'
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

console.log("[Backend] Starting Gemini Realtime Translation Server...");
console.log("[Backend] WebSocket endpoint: ws://localhost:" + port + "/translate");
console.log("[Backend] API Key configured:", process.env.GEMINI_API_KEY ? 'Yes ✓' : 'No ✗ (ERROR!)');
if (!process.env.GEMINI_API_KEY) {
  console.error("[Backend] ERROR: GEMINI_API_KEY not found in environment variables!");
  console.error("[Backend] Please create a .env file with your API key");
}