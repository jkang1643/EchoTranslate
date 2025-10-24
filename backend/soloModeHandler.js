/**
 * Solo Mode Handler - Uses Google Cloud Speech for transcription + OpenAI for translation
 * 
 * ARCHITECTURE:
 * - Google Cloud Speech-to-Text for streaming transcription with live partials
 * - OpenAI Chat API for translation of final transcripts
 * - Live partial results shown immediately for responsive UX
 * - Final results translated and displayed
 */

import { GoogleSpeechStream } from './googleSpeechStream.js';
import WebSocket from 'ws';
import translationManager from './translationManager.js';

export async function handleSoloMode(clientWs) {
  console.log("[SoloMode] ⚡ Connection using Google Speech + OpenAI Translation");

  let speechStream = null;
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
          
          // Reinitialize stream if source language changed
          const languagesChanged = (prevSourceLang !== currentSourceLang);
          if (languagesChanged && speechStream) {
            console.log('[SoloMode] 🔄 Source language changed! Destroying old stream...');
            speechStream.destroy();
            speechStream = null;
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          // Initialize Google Speech stream if needed
          if (!speechStream) {
            try {
              console.log(`[SoloMode] 🚀 Creating Google Speech stream for ${currentSourceLang}...`);
              speechStream = new GoogleSpeechStream();
              
              // Initialize with source language for transcription
              await speechStream.initialize(currentSourceLang);
              
              const isTranscriptionOnly = currentSourceLang === currentTargetLang;
              
              // Set up error callback
              speechStream.onError((error) => {
                console.error('[SoloMode] Speech stream error:', error);
                if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({
                    type: 'warning',
                    message: 'Transcription service restarting...',
                    code: error.code
                  }));
                }
              });
              
              // Translation throttling for partials
              let lastPartialTranslation = '';
              let lastPartialTranslationTime = 0;
              let pendingPartialTranslation = null;
              const PARTIAL_TRANSLATION_THROTTLE = 800; // Translate partials max every 800ms
              
              // Set up result callback - handles both partials and finals
              speechStream.onResult(async (transcriptText, isPartial) => {
                if (!clientWs || clientWs.readyState !== WebSocket.OPEN) return;
                
                if (isPartial) {
                  // Live partial transcript - send original immediately
                  // console.log(`[SoloMode] 🔵 PARTIAL: "${transcriptText.substring(0, 50)}..."`);
                  
                  // Always send original text immediately (no delay)
                  clientWs.send(JSON.stringify({
                    type: 'translation',
                    originalText: transcriptText,
                    translatedText: transcriptText, // Default to source text
                    timestamp: Date.now(),
                    sequenceId: -1,
                    isPartial: true,
                    isTranscriptionOnly: isTranscriptionOnly,
                    hasTranslation: false // Flag that translation is pending
                  }));
                  
                  // If translation needed and different from source lang
                  if (!isTranscriptionOnly && transcriptText.length > 10) {
                    const now = Date.now();
                    const timeSinceLastTranslation = now - lastPartialTranslationTime;
                    
                    // Throttle: Only translate if enough time passed and text changed significantly
                    if (timeSinceLastTranslation >= PARTIAL_TRANSLATION_THROTTLE && 
                        transcriptText !== lastPartialTranslation) {
                      
                      // Cancel any pending translation
                      if (pendingPartialTranslation) {
                        clearTimeout(pendingPartialTranslation);
                      }
                      
                      // Translate the partial text
                      lastPartialTranslationTime = now;
                      lastPartialTranslation = transcriptText;
                      
                      try {
                        console.log(`[SoloMode] 🔄 Translating partial: "${transcriptText.substring(0, 40)}..."`);
                        const translations = await translationManager.translateToMultipleLanguages(
                          transcriptText,
                          currentSourceLang,
                          [currentTargetLang],
                          process.env.OPENAI_API_KEY
                        );
                        
                        const translatedText = translations[currentTargetLang] || transcriptText;
                        
                        // Send updated translation
                        if (clientWs.readyState === WebSocket.OPEN) {
                          clientWs.send(JSON.stringify({
                            type: 'translation',
                            originalText: transcriptText,
                            translatedText: translatedText,
                            timestamp: Date.now(),
                            sequenceId: -1,
                            isPartial: true,
                            isTranscriptionOnly: false,
                            hasTranslation: true // Flag that this includes translation
                          }));
                        }
                      } catch (error) {
                        console.error(`[SoloMode] Partial translation error:`, error);
                      }
                    } else {
                      // Schedule delayed translation if text keeps updating
                      if (pendingPartialTranslation) {
                        clearTimeout(pendingPartialTranslation);
                      }
                      
                      pendingPartialTranslation = setTimeout(async () => {
                        if (transcriptText === lastPartialTranslation) return;
                        
                        try {
                          console.log(`[SoloMode] ⏱️ Delayed translating partial: "${transcriptText.substring(0, 40)}..."`);
                          const translations = await translationManager.translateToMultipleLanguages(
                            transcriptText,
                            currentSourceLang,
                            [currentTargetLang],
                            process.env.OPENAI_API_KEY
                          );
                          
                          const translatedText = translations[currentTargetLang] || transcriptText;
                          lastPartialTranslation = transcriptText;
                          
                          if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                              type: 'translation',
                              originalText: transcriptText,
                              translatedText: translatedText,
                              timestamp: Date.now(),
                              sequenceId: -1,
                              isPartial: true,
                              isTranscriptionOnly: false,
                              hasTranslation: true
                            }));
                          }
                        } catch (error) {
                          console.error(`[SoloMode] Delayed partial translation error:`, error);
                        }
                      }, PARTIAL_TRANSLATION_THROTTLE);
                    }
                  }
                } else {
                  // Final transcript
                  console.log(`[SoloMode] 📝 FINAL Transcript: "${transcriptText.substring(0, 50)}..."`);
                  
                  if (isTranscriptionOnly) {
                    // Same language - just send transcript
                    clientWs.send(JSON.stringify({
                      type: 'translation',
                      originalText: '',
                      translatedText: transcriptText,
                      timestamp: Date.now(),
                      sequenceId: Date.now(),
                      isPartial: false
                    }));
                  } else {
                    // Different language - translate the transcript
                    try {
                      const translations = await translationManager.translateToMultipleLanguages(
                        transcriptText,
                        currentSourceLang,
                        [currentTargetLang],
                        process.env.OPENAI_API_KEY
                      );
                      
                      const translatedText = translations[currentTargetLang] || transcriptText;
                      console.log(`[SoloMode] 📤 Sending translation: "${translatedText.substring(0, 50)}..."`);
                      
                      clientWs.send(JSON.stringify({
                        type: 'translation',
                        originalText: transcriptText,
                        translatedText: translatedText,
                        timestamp: Date.now(),
                        sequenceId: Date.now(),
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
                        sequenceId: Date.now(),
                        isPartial: false
                      }));
                    }
                  }
                }
              });
              
              console.log('[SoloMode] ✅ Google Speech stream initialized and ready');
            } catch (error) {
              console.error('[SoloMode] Failed to initialize Google Speech stream:', error);
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
          // Process audio through Google Speech stream
          if (speechStream) {
            // Stream audio to Google Speech for transcription
            await speechStream.processAudio(message.audioData);
          } else {
            console.warn('[SoloMode] Received audio before stream initialization');
          }
          break;
          
        case 'audio_end':
          console.log('[SoloMode] Audio stream ended');
          if (speechStream) {
            await speechStream.endAudio();
          }
          break;
        
        case 'force_commit':
          // Frontend requests to force-commit current turn (simulated pause)
          console.log('[SoloMode] 🔄 Force commit requested by frontend');
          if (speechStream) {
            await speechStream.forceCommit();
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
    
    if (speechStream) {
      speechStream.destroy();
      speechStream = null;
    }
  });

  // Initial greeting
  if (clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: 'info',
      message: 'Connected to Google Speech + OpenAI Translation. Waiting for initialization...'
    }));
  }
}

