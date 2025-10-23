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
  const AUDIO_END_TIMEOUT = 1000; // 1 second for natural speech pauses
  let audioEndTimer = null;
  let maxStreamTimer = null;
  let streamStartTime = null;
  let lastTranscript = '';
  let transcriptBuffer = ''; // Buffer for accumulating streaming transcript parts
  let audioGracePeriodTimer = null;
  const GRACE_PERIOD = 300; // Fixed 300ms grace period for audio end
  const EARLY_STOP_BUFFER = 500; // Stop 500ms early for complete capture
  
  // Timing metrics for monitoring
  let firstAudioSentTime = null;
  let firstResponseTime = null;
  let totalAudioChunksReceived = 0;
  let totalTranslationsReceived = 0;
  
  // Intelligent transcript merging to handle overlaps
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
        console.log(`[Host] Merged with ${k}-word overlap: "${prevTail}"`);
        return merged;
      }
    }
    
    // No overlap found - concatenate with space
    return `${previous} ${current}`;
  };

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
      console.log(`[Host] Triggering graceful audio end with ${GRACE_PERIOD}ms grace period`);
      
      // Stop accepting new audio immediately
      isStreamingAudio = false;
      
      // Wait for grace period before sending audioStreamEnd
      audioGracePeriodTimer = setTimeout(() => {
        sendAudioStreamEnd();
      }, GRACE_PERIOD);
    }
  };

  // Function to translate and broadcast transcript
  const translateAndBroadcast = async (transcript) => {
    if (!transcript) return;
    
    // For streaming mode, check for overlap with ONLY the last segment (not entire history)
    let finalTranscript = transcript;
    
    if (lastTranscript) {
      // Try to detect overlap with the immediate previous segment
      const merged = mergeTranscripts(lastTranscript, transcript);
      
      // Only use merged result if we found an actual overlap (merged is shorter than concat)
      if (merged.length < (lastTranscript.length + transcript.length)) {
        // Found overlap - extract only the NEW portion
        const newPortion = merged.substring(lastTranscript.length).trim();
        if (newPortion) {
          finalTranscript = newPortion;
          console.log(`[Host] Detected overlap, sending only new portion: "${newPortion.substring(0, 50)}..."`);
        }
      }
    }
    
    // Store this segment as the last one (for next overlap check)
    lastTranscript = transcript;

    console.log(`[Host] New transcript: ${finalTranscript.substring(0, 100)}...`);

    // Get all target languages needed
    const targetLanguages = sessionStore.getSessionLanguages(sessionId);
    
    if (targetLanguages.length === 0) {
      console.log('[Host] No listeners yet, skipping translation');
      return;
    }

    try {
      // Translate to all needed languages at once
      const translations = await translationManager.translateToMultipleLanguages(
        finalTranscript,
        currentSourceLang,
        targetLanguages,
        process.env.GEMINI_API_KEY
      );

      console.log(`[Host] Translated to ${Object.keys(translations).length} languages`);

      // Broadcast to each language group
      for (const [targetLang, translatedText] of Object.entries(translations)) {
        sessionStore.broadcastToListeners(sessionId, {
          type: 'translation',
          originalText: finalTranscript,
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
        const responseTime = Date.now();

        if (response.setupComplete) {
          console.log('[Host] ✅ Gemini setup complete - ready for audio');
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
            console.log(`[Host] 📤 Processing ${messageQueue.length} queued messages`);
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
          
          // Track first response timing
          if (!firstResponseTime && firstAudioSentTime) {
            firstResponseTime = responseTime;
            const latency = responseTime - firstAudioSentTime;
            console.log(`[Host] ⚡ First response latency: ${latency}ms`);
          }
          
          if (serverContent.modelTurn && serverContent.modelTurn.parts) {
            // Accumulate all text parts into buffer
            for (const part of serverContent.modelTurn.parts) {
              if (part.text) {
                transcriptBuffer += part.text;
                console.log(`[Host] 📝 Received text chunk: "${part.text.substring(0, 50)}${part.text.length > 50 ? '...' : ''}"`);
              }
            }
          }
          
          if (serverContent.turnComplete) {
            totalTranslationsReceived++;
            const turnDuration = streamStartTime ? (Date.now() - streamStartTime) : 0;
            console.log(`[Host] ✅ Turn complete (#${totalTranslationsReceived}) - Duration: ${turnDuration}ms`);
            
            // Now send the complete buffered transcript
            if (transcriptBuffer.trim()) {
              const completeTranscript = transcriptBuffer.trim();
              const transcriptLength = completeTranscript.length;
              
              console.log(`[Host] 📋 Complete transcript (${transcriptLength} chars): "${completeTranscript.substring(0, 100)}${transcriptLength > 100 ? '...' : ''}"`);
              
              // Send complete transcript to host
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'transcript',
                  text: completeTranscript,
                  timestamp: Date.now()
                }));
              }

              // Translate and broadcast complete sentence
              const translateStartTime = Date.now();
              await translateAndBroadcast(completeTranscript);
              const translateDuration = Date.now() - translateStartTime;
              console.log(`[Host] 🌐 Translation broadcast completed in ${translateDuration}ms`);
              
              // Clear buffer for next turn
              transcriptBuffer = '';
            }
            
            if (audioEndTimer) {
              clearTimeout(audioEndTimer);
              audioEndTimer = null;
            }
            
            if (maxStreamTimer) {
              clearTimeout(maxStreamTimer);
              maxStreamTimer = null;
            }
            
            isStreamingAudio = false;
            lastAudioTime = null;
            streamStartTime = null;
            firstAudioSentTime = null;
            firstResponseTime = null;
            
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'turn_complete',
                timestamp: Date.now()
              }));
            }
          }
        }
      } catch (error) {
        console.error('[Host] ❌ Error processing Gemini response:', error);
      }
    });

    ws.on('close', async (code, reason) => {
      console.log(`[Host] Gemini connection closed. Code: ${code}`);
      
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
          
          if (message.maxStreamDuration) {
            sessionStore.updateMaxStreamDuration(sessionId, message.maxStreamDuration);
          }
          
          // Reset transcript history on init
          lastTranscript = '';
          
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
            totalAudioChunksReceived++;
            
            // Log segment metadata if provided
            if (message.metadata) {
              const { duration, reason, overlapMs, sendId, queueSize } = message.metadata;
              console.log(`[Host] 📥 Audio chunk #${totalAudioChunksReceived} (send #${sendId || '?'}): ${duration?.toFixed(0) || '?'}ms, reason: ${reason || 'unknown'}, overlap: ${overlapMs || 0}ms, queue: ${queueSize || '?'}`);
            }
            
            if (!isStreamingAudio) {
              console.log('[Host] 🎤 Starting NEW audio stream');
              isStreamingAudio = true;
              streamStartTime = Date.now();
              firstAudioSentTime = Date.now();
              
              // Get max stream duration from session settings
              const userMaxDuration = sessionStore.getMaxStreamDuration(sessionId) || 3000;
              
              // Apply pre-emptive stop: reduce by 500ms for buffer
              const actualMaxDuration = userMaxDuration - EARLY_STOP_BUFFER;
              console.log(`[Host] ⏱️  Max stream duration: ${userMaxDuration}ms (using ${actualMaxDuration}ms with ${EARLY_STOP_BUFFER}ms buffer)`);
              
              // Set hard timeout for max stream duration
              maxStreamTimer = setTimeout(() => {
                console.log('[Host] ⏰ Max stream duration reached, forcing cutoff');
                triggerGracefulAudioEnd();
              }, actualMaxDuration);
            }
            
            const audioMessage = {
              realtimeInput: {
                audio: {
                  mimeType: 'audio/pcm;rate=16000',
                  data: message.audioData
                }
              }
            };
            
            const sendTime = Date.now();
            geminiWs.send(JSON.stringify(audioMessage));
            const sendDuration = Date.now() - sendTime;
            
            if (sendDuration > 10) {
              console.log(`[Host] ⚠️  Audio send took ${sendDuration}ms (should be <10ms)`);
            }
            
            lastAudioTime = Date.now();
            
            // Reset idle timeout (this resets on each audio chunk)
            if (audioEndTimer) clearTimeout(audioEndTimer);
            audioEndTimer = setTimeout(() => {
              console.log('[Host] 🔇 Silence detected, triggering audio end');
              triggerGracefulAudioEnd();
            }, AUDIO_END_TIMEOUT);
          } else if (!setupComplete && messageQueue.length < 10) {
            console.log(`[Host] 📋 Queuing audio (setup not complete), queue size: ${messageQueue.length + 1}`);
            messageQueue.push({ type: 'audio', message });
          }
          break;
        
        case 'audio_end':
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
          lastTranscript = '';
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
    
    if (maxStreamTimer) {
      clearTimeout(maxStreamTimer);
      maxStreamTimer = null;
    }
    
    if (audioGracePeriodTimer) {
      clearTimeout(audioGracePeriodTimer);
      audioGracePeriodTimer = null;
    }
    
    transcriptBuffer = '';
    
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

