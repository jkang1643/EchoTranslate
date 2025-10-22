/**
 * WebSocket Handler - Manages connections for hosts and listeners
 */

import WebSocket from 'ws';
import sessionStore from './sessionStore.js';
import translationManager from './translationManager.js';

/**
 * Handle host connection
 */
export async function handleHostConnection(clientWs, sessionId) {
  console.log(`[WebSocket] Host connecting to session ${sessionId}`);
  
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'Session not found'
    }));
    clientWs.close();
    return;
  }

  let geminiWs = null;
  let currentSourceLang = 'en';
  let reconnecting = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  let messageQueue = [];
  
  // State management for multi-turn streaming
  let isStreamingAudio = false;
  let setupComplete = false;
  let lastAudioTime = null;
  const AUDIO_END_TIMEOUT = 2000;
  let audioEndTimer = null;
  let lastTranscript = '';

  // Function to send audio stream end signal
  const sendAudioStreamEnd = () => {
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN && isStreamingAudio) {
      console.log('[Host] Sending audioStreamEnd signal');
      geminiWs.send(JSON.stringify({
        realtimeInput: {
          audioStreamEnd: true
        }
      }));
      isStreamingAudio = false;
      lastAudioTime = null;
    }
  };

  // Function to translate and broadcast transcript
  const translateAndBroadcast = async (transcript) => {
    if (!transcript || transcript === lastTranscript) return;
    lastTranscript = transcript;

    console.log(`[Host] New transcript: ${transcript.substring(0, 100)}...`);

    // Get all target languages needed
    const targetLanguages = sessionStore.getSessionLanguages(sessionId);
    
    if (targetLanguages.length === 0) {
      console.log('[Host] No listeners yet, skipping translation');
      return;
    }

    try {
      // Translate to all needed languages at once
      const translations = await translationManager.translateToMultipleLanguages(
        transcript,
        currentSourceLang,
        targetLanguages,
        process.env.GEMINI_API_KEY
      );

      console.log(`[Host] Translated to ${Object.keys(translations).length} languages`);

      // Broadcast to each language group
      for (const [targetLang, translatedText] of Object.entries(translations)) {
        sessionStore.broadcastToListeners(sessionId, {
          type: 'translation',
          originalText: transcript,
          translatedText: translatedText,
          sourceLang: currentSourceLang,
          targetLang: targetLang,
          timestamp: Date.now()
        }, targetLang);
      }
    } catch (error) {
      console.error('[Host] Translation error:', error);
    }
  };

  // Function to attach Gemini handlers
  const attachGeminiHandlers = (ws) => {
    ws.on('error', (error) => {
      console.error('[Host] Gemini WebSocket error:', error.message || error);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: 'Gemini connection error: ' + (error.message || 'Unknown error')
        }));
      }
    });

    ws.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());

        if (response.setupComplete) {
          console.log('[Host] Gemini setup complete');
          setupComplete = true;
          
          // Notify host
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'gemini_ready',
              message: 'Ready to receive audio'
            }));
          }

          // Process queued messages
          if (messageQueue.length > 0) {
            console.log(`[Host] Processing ${messageQueue.length} queued messages`);
            const queuedMessages = [...messageQueue];
            messageQueue = [];
            queuedMessages.forEach(queued => {
              if (queued.type === 'audio') {
                clientWs.emit('message', JSON.stringify(queued.message));
              }
            });
          }
          return;
        }

        // Process server content (transcription)
        if (response.serverContent) {
          const serverContent = response.serverContent;
          
          if (serverContent.modelTurn && serverContent.modelTurn.parts) {
            for (const part of serverContent.modelTurn.parts) {
              if (part.text) {
                const transcript = part.text.trim();
                
                // Send transcript to host
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'transcript',
                    text: transcript,
                    timestamp: Date.now()
                  }));
                }

                // Translate and broadcast to listeners
                await translateAndBroadcast(transcript);
              }
            }
          }
          
          if (serverContent.turnComplete) {
            console.log('[Host] Model turn complete');
            
            if (audioEndTimer) {
              clearTimeout(audioEndTimer);
              audioEndTimer = null;
            }
            
            isStreamingAudio = false;
            lastAudioTime = null;
            
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'turn_complete',
                timestamp: Date.now()
              }));
            }
          }
        }
      } catch (error) {
        console.error('[Host] Error processing Gemini response:', error);
      }
    });

    ws.on('close', async (code, reason) => {
      console.log(`[Host] Gemini connection closed. Code: ${code}`);
      
      isStreamingAudio = false;
      setupComplete = false;
      lastAudioTime = null;
      if (audioEndTimer) {
        clearTimeout(audioEndTimer);
        audioEndTimer = null;
      }
      
      if (code === 1011 && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[Host] Persistent quota error - stopping reconnection');
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            message: 'Persistent API error. Please check your billing and API key.',
            persistent: true
          }));
        }
        return;
      }
      
      if (clientWs.readyState === WebSocket.OPEN && !reconnecting) {
        reconnecting = true;
        const backoffDelay = Math.min(500 * Math.pow(2, reconnectAttempts), 4000);
        
        try {
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          geminiWs = await connectToGemini();
          attachGeminiHandlers(geminiWs);
          reconnecting = false;
          if (code !== 1011) reconnectAttempts = 0;
        } catch (error) {
          reconnecting = false;
          console.error('[Host] Reconnection failed:', error);
        }
      }
    });
  };

  // Function to connect to Gemini
  const connectToGemini = () => {
    return new Promise((resolve, reject) => {
      console.log('[Host] Connecting to Gemini...');
      
      const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
      const ws = new WebSocket(geminiWsUrl);
      
      ws.on('open', () => {
        console.log('[Host] Connected to Gemini');
        
        const systemInstruction = translationManager.getSystemInstruction(currentSourceLang, 'transcript');
        
        const setupMessage = {
          setup: {
            model: 'models/gemini-live-2.5-flash-preview',
            generationConfig: {
              responseModalities: ['TEXT']
            },
            systemInstruction: systemInstruction
          }
        };
        
        ws.send(JSON.stringify(setupMessage));
        resolve(ws);
      });
      
      ws.on('error', (error) => {
        console.error('[Host] Gemini connection error:', error);
        reject(error);
      });
    });
  };

  // Handle client messages
  clientWs.on('message', (msg) => {
    try {
      const message = JSON.parse(msg.toString());

      switch (message.type) {
        case 'init':
          if (message.sourceLang) {
            currentSourceLang = message.sourceLang;
            sessionStore.updateSourceLanguage(sessionId, currentSourceLang);
          }
          
          console.log(`[Host] Initialized with source language: ${currentSourceLang}`);
          
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'session_ready',
              sessionId: sessionId,
              sessionCode: session.sessionCode,
              role: 'host'
            }));
          }
          break;

        case 'audio':
          if (geminiWs && geminiWs.readyState === WebSocket.OPEN && setupComplete) {
            if (!isStreamingAudio) {
              console.log('[Host] Starting audio stream');
              isStreamingAudio = true;
            }
            
            const audioMessage = {
              realtimeInput: {
                audio: {
                  mimeType: 'audio/pcm;rate=16000',
                  data: message.audioData
                }
              }
            };
            
            geminiWs.send(JSON.stringify(audioMessage));
            lastAudioTime = Date.now();
            
            if (audioEndTimer) clearTimeout(audioEndTimer);
            audioEndTimer = setTimeout(() => {
              sendAudioStreamEnd();
            }, AUDIO_END_TIMEOUT);
          } else if (!setupComplete && messageQueue.length < 10) {
            messageQueue.push({ type: 'audio', message });
          }
          break;
        
        case 'audio_end':
          if (audioEndTimer) {
            clearTimeout(audioEndTimer);
            audioEndTimer = null;
          }
          sendAudioStreamEnd();
          break;
      }
    } catch (error) {
      console.error('[Host] Error processing message:', error);
    }
  });

  // Handle host disconnect
  clientWs.on('close', () => {
    console.log('[Host] Disconnected from session');
    
    if (audioEndTimer) {
      clearTimeout(audioEndTimer);
      audioEndTimer = null;
    }
    
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
    
    sessionStore.closeSession(sessionId);
  });

  // Initialize Gemini connection
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    
    geminiWs = await connectToGemini();
    attachGeminiHandlers(geminiWs);
    sessionStore.setHost(sessionId, clientWs, geminiWs);
    
    console.log(`[Host] Session ${session.sessionCode} is now active`);
  } catch (error) {
    console.error('[Host] Initialization error:', error);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'error',
        message: `Failed to initialize: ${error.message}`
      }));
    }
  }
}

/**
 * Handle listener connection
 */
export function handleListenerConnection(clientWs, sessionId, targetLang, userName) {
  console.log(`[WebSocket] Listener connecting: ${userName} (${targetLang})`);
  
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'Session not found'
    }));
    clientWs.close();
    return;
  }

  // Generate socket ID
  const socketId = `listener_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    // Add listener to session
    sessionStore.addListener(sessionId, socketId, clientWs, targetLang, userName);
    
    // Send welcome message
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'session_joined',
        sessionId: session.sessionId,
        sessionCode: session.sessionCode,
        role: 'listener',
        targetLang: targetLang,
        sourceLang: session.sourceLang,
        message: `Connected to session ${session.sessionCode}`
      }));
    }

    // Send session stats periodically
    const statsInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        const stats = sessionStore.getSessionStats(sessionId);
        clientWs.send(JSON.stringify({
          type: 'session_stats',
          stats: stats
        }));
      }
    }, 10000); // Every 10 seconds

    // Handle listener disconnect
    clientWs.on('close', () => {
      console.log(`[Listener] ${userName} disconnected`);
      clearInterval(statsInterval);
      sessionStore.removeListener(sessionId, socketId);
    });

    // Handle listener messages (if any)
    clientWs.on('message', (msg) => {
      try {
        const message = JSON.parse(msg.toString());
        
        // Listeners might send language changes
        if (message.type === 'change_language' && message.targetLang) {
          console.log(`[Listener] ${userName} changing language to ${message.targetLang}`);
          
          // Remove from old language group
          sessionStore.removeListener(sessionId, socketId);
          
          // Add to new language group
          sessionStore.addListener(sessionId, socketId, clientWs, message.targetLang, userName);
          
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'language_changed',
              targetLang: message.targetLang
            }));
          }
        }
      } catch (error) {
        console.error('[Listener] Error processing message:', error);
      }
    });

  } catch (error) {
    console.error('[Listener] Error:', error);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
    clientWs.close();
  }
}

