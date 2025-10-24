/**
 * Host Mode Handler - Uses OpenAI Realtime Session Pool for multi-user sessions
 * 
 * MIGRATION NOTES:
 * - Replaced GeminiSessionPool with OpenAIRealtimePool
 * - Uses OpenAI Realtime API for transcription
 * - Translation still handled by translationManager (using separate API calls)
 * - Maintains same session management and multi-user broadcast logic
 */

import { OpenAIRealtimePool } from './openaiRealtimePool.js';
import WebSocket from 'ws';
import sessionStore from './sessionStore.js';
import translationManager from './translationManager.js';

export async function handleHostConnection(clientWs, sessionId) {
  console.log(`[HostMode] ⚡ Host connecting to session ${sessionId} - Using OpenAI Realtime API`);
  
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'Session not found'
    }));
    clientWs.close();
    return;
  }

  let sessionPool = null;
  let currentSourceLang = 'en';

  // Handle client messages
  clientWs.on('message', async (msg) => {
    try {
      const message = JSON.parse(msg.toString());

      switch (message.type) {
        case 'init':
          if (message.sourceLang) {
            currentSourceLang = message.sourceLang;
            sessionStore.updateSourceLanguage(sessionId, currentSourceLang);
          }
          
          console.log(`[HostMode] Session ${sessionId} initialized with source language: ${currentSourceLang}`);
          
          // Initialize OpenAI Realtime session pool
          if (!sessionPool) {
            try {
              // MIGRATION NOTE: Check for OpenAI API key instead of Gemini
              if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY not configured in environment');
              }
              
              sessionPool = new OpenAIRealtimePool(process.env.OPENAI_API_KEY, 1); // 1 session (single host speaker)
              await sessionPool.initialize(currentSourceLang, currentSourceLang); // Transcription mode
              
              // Set up result callback with support for partial transcripts
              sessionPool.onResult(async (transcriptText, sequence, isPartial = false) => {
                if (isPartial) {
                  // Live partial transcript - INSTANT, NO TRANSLATION
                  // Translation is too slow for word-by-word live display
                  // Broadcast source language immediately to all listeners
                  sessionStore.broadcastToListeners(sessionId, {
                    type: 'translation',
                    originalText: transcriptText,
                    translatedText: transcriptText, // Show source language for partials
                    sourceLang: currentSourceLang,
                    targetLang: currentSourceLang,
                    timestamp: Date.now(),
                    sequenceId: -1,
                    isPartial: true
                  });
                  return;
                }
                
                // Final transcript - translate and broadcast
                console.log(`[HostMode] 📝 FINAL Transcript #${sequence}: "${transcriptText.substring(0, 50)}..."`);
                
                // Get all target languages needed
                const targetLanguages = sessionStore.getSessionLanguages(sessionId);
                
                if (targetLanguages.length === 0) {
                  console.log('[HostMode] No listeners yet, skipping translation');
                  return;
                }

                try {
                  // Translate to all needed languages at once
                  const translations = await translationManager.translateToMultipleLanguages(
                    transcriptText,
                    currentSourceLang,
                    targetLanguages,
                    process.env.OPENAI_API_KEY
                  );

                  console.log(`[HostMode] Translated to ${Object.keys(translations).length} languages`);

                  // Broadcast to each language group
                  for (const [targetLang, translatedText] of Object.entries(translations)) {
                    sessionStore.broadcastToListeners(sessionId, {
                      type: 'translation',
                      originalText: transcriptText,
                      translatedText: translatedText,
                      sourceLang: currentSourceLang,
                      targetLang: targetLang,
                      timestamp: Date.now(),
                      sequenceId: sequence,
                      isPartial: false
                    }, targetLang);
                  }
                } catch (error) {
                  console.error('[HostMode] Translation error:', error);
                }
              });
              
              console.log('[HostMode] ✅ OpenAI Realtime pool initialized and ready');
            } catch (error) {
              console.error('[HostMode] Failed to initialize OpenAI Realtime pool:', error);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'error',
                  message: `Failed to initialize: ${error.message}`
                }));
              }
              return;
            }
          }
          
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
          // Process audio through session pool - NON-BLOCKING
          if (sessionPool) {
            const { duration, reason, overlapMs } = message.metadata || {};
            console.log(`[HostMode] 🎤 Audio: ${duration?.toFixed(0) || '?'}ms, reason: ${reason || 'unknown'}, overlap: ${overlapMs || 0}ms`);
            
            // Non-blocking - always accepts audio
            await sessionPool.processAudio(message.audioData);
            
            // Log pool stats every 10 chunks
            const stats = sessionPool.getStats();
            if (stats.nextSequence % 10 === 0) {
              console.log(`[HostMode] 📊 Pool stats: ${stats.busySessions}/${stats.totalSessions} busy, ${stats.totalQueuedItems} queued, ${stats.pendingResults} pending`);
            }
          } else {
            console.warn('[HostMode] Received audio before pool initialization');
          }
          break;
          
        case 'audio_end':
          console.log('[HostMode] Audio stream ended');
          // Pool continues processing queued items automatically
          break;
      }
    } catch (error) {
      console.error('[HostMode] Error processing message:', error);
    }
  });

  // Handle host disconnect
  clientWs.on('close', () => {
    console.log('[HostMode] Host disconnected from session');
    
    if (sessionPool) {
      sessionPool.destroy();
      sessionPool = null;
    }
    
    sessionStore.closeSession(sessionId);
  });

  // Initialize the session as active
  sessionStore.setHost(sessionId, clientWs, null); // No direct WebSocket needed with pool
  console.log(`[HostMode] Session ${session.sessionCode} is now active with OpenAI Realtime`);
}

