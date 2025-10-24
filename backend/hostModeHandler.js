/**
 * Host Mode Handler - Uses Google Cloud Speech for transcription + OpenAI for translation
 * 
 * ARCHITECTURE:
 * - Google Cloud Speech-to-Text for streaming transcription with live partials
 * - OpenAI Chat API for translation of final transcripts
 * - Live partial results broadcast to all listeners immediately
 * - Final results translated and broadcast to each language group
 */

import { GoogleSpeechStream } from './googleSpeechStream.js';
import WebSocket from 'ws';
import sessionStore from './sessionStore.js';
import translationManager from './translationManager.js';

export async function handleHostConnection(clientWs, sessionId) {
  console.log(`[HostMode] ⚡ Host connecting to session ${sessionId} - Using Google Speech + OpenAI Translation`);
  
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'Session not found'
    }));
    clientWs.close();
    return;
  }

  let speechStream = null;
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
          
          // Initialize Google Speech stream
          if (!speechStream) {
            try {
              console.log(`[HostMode] 🚀 Creating Google Speech stream for ${currentSourceLang}...`);
              speechStream = new GoogleSpeechStream();
              
              // Initialize with source language for transcription
              await speechStream.initialize(currentSourceLang);
              
              // Set up error callback
              speechStream.onError((error) => {
                console.error('[HostMode] Speech stream error:', error);
                // Notify host
                if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'warning',
                    message: 'Transcription service restarting...',
                    code: error.code
                  }));
                }
                // Optionally notify all listeners
                sessionStore.broadcastToListeners(sessionId, {
                  type: 'warning',
                  message: 'Service restarting, please wait...'
                });
              });
              
              // Translation throttling for partials
              let lastPartialTranslations = {}; // Track last translation per language
              let lastPartialTranslationTime = 0;
              let pendingPartialTranslation = null;
              const PARTIAL_TRANSLATION_THROTTLE = 800; // Max every 800ms
              
              // Set up result callback - handles both partials and finals
              speechStream.onResult(async (transcriptText, isPartial) => {
                if (isPartial) {
                  // Live partial transcript - send original immediately to ALL listeners
                  sessionStore.broadcastToListeners(sessionId, {
                    type: 'translation',
                    originalText: transcriptText,
                    translatedText: transcriptText, // Default to source
                    sourceLang: currentSourceLang,
                    targetLang: currentSourceLang,
                    timestamp: Date.now(),
                    sequenceId: -1,
                    isPartial: true,
                    hasTranslation: false
                  });
                  
                  // Throttled translation for listeners with different target languages
                  const targetLanguages = sessionStore.getSessionLanguages(sessionId);
                  if (targetLanguages.length > 0 && transcriptText.length > 10) {
                    const now = Date.now();
                    const timeSinceLastTranslation = now - lastPartialTranslationTime;
                    
                    if (timeSinceLastTranslation >= PARTIAL_TRANSLATION_THROTTLE) {
                      lastPartialTranslationTime = now;
                      
                      // Cancel pending translation
                      if (pendingPartialTranslation) {
                        clearTimeout(pendingPartialTranslation);
                      }
                      
                      try {
                        console.log(`[HostMode] 🔄 Translating partial to ${targetLanguages.length} language(s)`);
                        const translations = await translationManager.translateToMultipleLanguages(
                          transcriptText,
                          currentSourceLang,
                          targetLanguages,
                          process.env.OPENAI_API_KEY
                        );
                        
                        // Broadcast translated partials to each language group
                        for (const [targetLang, translatedText] of Object.entries(translations)) {
                          lastPartialTranslations[targetLang] = transcriptText;
                          sessionStore.broadcastToListeners(sessionId, {
                            type: 'translation',
                            originalText: transcriptText,
                            translatedText: translatedText,
                            sourceLang: currentSourceLang,
                            targetLang: targetLang,
                            timestamp: Date.now(),
                            sequenceId: -1,
                            isPartial: true,
                            hasTranslation: true
                          }, targetLang);
                        }
                      } catch (error) {
                        console.error('[HostMode] Partial translation error:', error);
                      }
                    } else {
                      // Schedule delayed translation
                      if (pendingPartialTranslation) {
                        clearTimeout(pendingPartialTranslation);
                      }
                      
                      pendingPartialTranslation = setTimeout(async () => {
                        try {
                          const translations = await translationManager.translateToMultipleLanguages(
                            transcriptText,
                            currentSourceLang,
                            targetLanguages,
                            process.env.OPENAI_API_KEY
                          );
                          
                          for (const [targetLang, translatedText] of Object.entries(translations)) {
                            lastPartialTranslations[targetLang] = transcriptText;
                            sessionStore.broadcastToListeners(sessionId, {
                              type: 'translation',
                              originalText: transcriptText,
                              translatedText: translatedText,
                              sourceLang: currentSourceLang,
                              targetLang: targetLang,
                              timestamp: Date.now(),
                              sequenceId: -1,
                              isPartial: true,
                              hasTranslation: true
                            }, targetLang);
                          }
                        } catch (error) {
                          console.error('[HostMode] Delayed partial translation error:', error);
                        }
                      }, PARTIAL_TRANSLATION_THROTTLE);
                    }
                  }
                  return;
                }
                
                // Final transcript - translate and broadcast
                console.log(`[HostMode] 📝 FINAL Transcript: "${transcriptText.substring(0, 50)}..."`);
                
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
                      sequenceId: Date.now(),
                      isPartial: false
                    }, targetLang);
                  }
                } catch (error) {
                  console.error('[HostMode] Translation error:', error);
                }
              });
              
              console.log('[HostMode] ✅ Google Speech stream initialized and ready');
            } catch (error) {
              console.error('[HostMode] Failed to initialize Google Speech stream:', error);
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
          // Process audio through Google Speech stream
          if (speechStream) {
            // Stream audio to Google Speech for transcription
            await speechStream.processAudio(message.audioData);
          } else {
            console.warn('[HostMode] Received audio before stream initialization');
          }
          break;
          
        case 'audio_end':
          console.log('[HostMode] Audio stream ended');
          if (speechStream) {
            await speechStream.endAudio();
          }
          break;
      }
    } catch (error) {
      console.error('[HostMode] Error processing message:', error);
    }
  });

  // Handle host disconnect
  clientWs.on('close', () => {
    console.log('[HostMode] Host disconnected from session');
    
    if (speechStream) {
      speechStream.destroy();
      speechStream = null;
    }
    
    sessionStore.closeSession(sessionId);
  });

  // Initialize the session as active
  sessionStore.setHost(sessionId, clientWs, null); // No direct WebSocket needed with stream
  console.log(`[HostMode] Session ${session.sessionCode} is now active with Google Speech`);
}

