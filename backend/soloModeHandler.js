/**
 * Solo Mode Handler - Uses OpenAI Realtime Session Pool for parallel processing
 * 
 * MIGRATION NOTES:
 * - Replaced GeminiSessionPool with OpenAIRealtimePool
 * - Uses OpenAI Realtime API for real-time transcription/translation
 * - Maintains non-blocking audio processing with parallel sessions
 * - Same client interface and message protocol
 */

import { OpenAIRealtimePool } from './openaiRealtimePool.js';
import WebSocket from 'ws';
import translationManager from './translationManager.js';

export async function handleSoloMode(clientWs) {
  console.log("[SoloMode] ⚡ Connection using OpenAI Realtime API");

  let sessionPool = null;
  let currentSourceLang = 'en';
  let currentTargetLang = 'es';
  let legacySessionId = `session_${Date.now()}`;

  // Handle client messages
  clientWs.on("message", async (msg) => {
    try {
      const message = JSON.parse(msg.toString());
      console.log("[SoloMode] Client message:", message.type);

      switch (message.type) {
        case 'init':
          // Update language preferences
          const prevSourceLang = currentSourceLang;
          const prevTargetLang = currentTargetLang;
          
          console.log(`[SoloMode] Init received - sourceLang: ${message.sourceLang}, targetLang: ${message.targetLang}`);
          
          if (message.sourceLang) {
            currentSourceLang = message.sourceLang;
          }
          if (message.targetLang) {
            currentTargetLang = message.targetLang;
          }
          
          const isTranscription = currentSourceLang === currentTargetLang;
          console.log(`[SoloMode] Languages: ${currentSourceLang} → ${currentTargetLang} (${isTranscription ? 'TRANSCRIPTION' : 'TRANSLATION'} mode)`);
          
          // Reinitialize pool if languages changed
          const languagesChanged = (prevSourceLang !== currentSourceLang) || (prevTargetLang !== currentTargetLang);
          if (languagesChanged && sessionPool) {
            console.log('[SoloMode] 🔄 Languages changed! Destroying old pool...');
            sessionPool.destroy();
            sessionPool = null;
            // Small delay to ensure WebSocket connections are fully closed
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          // Initialize OpenAI Realtime pool if needed
          if (!sessionPool) {
            try {
              // MIGRATION NOTE: Use OpenAI API key instead of Gemini
              if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY not configured in environment');
              }
              
              console.log(`[SoloMode] 🚀 Creating NEW OpenAI pool with languages: ${currentSourceLang} → ${currentTargetLang}`);
              sessionPool = new OpenAIRealtimePool(process.env.OPENAI_API_KEY, 1); // 1 session (solo speaker)
              
              // CRITICAL: Always transcribe only (like Host Mode), never translate directly
              await sessionPool.initialize(currentSourceLang, currentSourceLang); // TRANSCRIPTION ONLY
              
              const isTranscriptionOnly = currentSourceLang === currentTargetLang;
              
              // Set up result callback with support for partial transcripts
              sessionPool.onResult(async (transcriptText, sequence, isPartial = false) => {
                if (!clientWs || clientWs.readyState !== WebSocket.OPEN) return;
                
                if (isPartial) {
                  // Live partial transcript - INSTANT, NO TRANSLATION
                  console.log(`[SoloMode] 🔵 PARTIAL: "${transcriptText.substring(0, 50)}..."`);
                  clientWs.send(JSON.stringify({
                    type: 'translation',
                    originalText: transcriptText,
                    translatedText: transcriptText, // Show source language for partials
                    timestamp: Date.now(),
                    sequenceId: -1,
                    isPartial: true,
                    isTranscriptionOnly: isTranscriptionOnly
                  }));
                } else {
                  // Final transcript
                  console.log(`[SoloMode] 📝 FINAL Transcript #${sequence}: "${transcriptText.substring(0, 50)}..."`);
                  
                  if (isTranscriptionOnly) {
                    // Same language - just send transcript
                    clientWs.send(JSON.stringify({
                      type: 'translation',
                      originalText: '',
                      translatedText: transcriptText,
                      timestamp: Date.now(),
                      sequenceId: sequence,
                      isPartial: false
                    }));
                  } else {
                    // Different language - translate the transcript (like Host Mode)
                    try {
                      const translations = await translationManager.translateToMultipleLanguages(
                        transcriptText,
                        currentSourceLang,
                        [currentTargetLang],
                        process.env.OPENAI_API_KEY
                      );
                      
                      const translatedText = translations[currentTargetLang] || transcriptText;
                      console.log(`[SoloMode] 📤 Sending translation #${sequence}: "${translatedText.substring(0, 50)}..."`);
                      
                      clientWs.send(JSON.stringify({
                        type: 'translation',
                        originalText: transcriptText,
                        translatedText: translatedText,
                        timestamp: Date.now(),
                        sequenceId: sequence,
                        isPartial: false
                      }));
                    } catch (error) {
                      console.error(`[SoloMode] Translation error:`, error);
                      // Send transcript as fallback
                      clientWs.send(JSON.stringify({
                        type: 'translation',
                        originalText: transcriptText,
                        translatedText: `[Translation error: ${error.message}]`,
                        timestamp: Date.now(),
                        sequenceId: sequence,
                        isPartial: false
                      }));
                    }
                  }
                }
              });
              
              console.log('[SoloMode] ✅ OpenAI Realtime pool initialized and ready');
            } catch (error) {
              console.error('[SoloMode] Failed to initialize OpenAI Realtime pool:', error);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'error',
                  message: `Failed to initialize: ${error.message}`
                }));
              }
              return;
            }
          }
          
          // Send ready message
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'session_ready',
              sessionId: legacySessionId,
              message: `Translation session ready: ${currentSourceLang} → ${currentTargetLang}`
            }));
          }
          break;

        case 'audio':
          // Process audio through session pool - NON-BLOCKING
          if (sessionPool) {
            const { duration, reason, overlapMs } = message.metadata || {};
            console.log(`[SoloMode] 🎤 Audio: ${duration?.toFixed(0) || '?'}ms, reason: ${reason || 'unknown'}, overlap: ${overlapMs || 0}ms`);
            
            // Non-blocking - always accepts audio
            await sessionPool.processAudio(message.audioData);
            
            // Log pool stats every 10 chunks
            const stats = sessionPool.getStats();
            if (stats.nextSequence % 10 === 0) {
              console.log(`[SoloMode] 📊 Pool stats: ${stats.busySessions}/${stats.totalSessions} busy, ${stats.totalQueuedItems} queued, ${stats.pendingResults} pending`);
            }
          } else {
            console.warn('[SoloMode] Received audio before pool initialization');
          }
          break;
          
        case 'audio_end':
          console.log('[SoloMode] Audio stream ended');
          // Pool continues processing queued items automatically
          break;
        
        case 'force_commit':
          // Frontend requests to force-commit current turn (simulated pause)
          console.log('[SoloMode] 🔄 Force commit requested by frontend');
          if (sessionPool) {
            await sessionPool.forceCommit(); // Now async with delay
          }
          break;
          
        default:
          console.log(`[SoloMode] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error("[SoloMode] Error processing message:", error);
    }
  });

  // Handle client disconnect
  clientWs.on("close", () => {
    console.log("[SoloMode] Client disconnected");
    
    if (sessionPool) {
      sessionPool.destroy();
      sessionPool = null;
    }
  });

  // Initial greeting
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: 'info',
      message: 'Connected to OpenAI Realtime. Waiting for initialization...'
    }));
  }
}

