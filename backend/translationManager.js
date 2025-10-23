/**
 * Translation Manager - Handles translation for multi-user sessions
 * Optimizes API calls by translating once per language, not per user
 */

import fetch from 'node-fetch';
import WebSocket from 'ws';

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

class TranslationManager {
  constructor() {
    this.translationCache = new Map(); // Cache recent translations
    this.pendingTranslations = new Map(); // Debounce translation requests
  }

  /**
   * Translate text from source language to multiple target languages
   * Uses batch translation to minimize API calls
   */
  async translateToMultipleLanguages(text, sourceLang, targetLangs, apiKey) {
    if (!text || targetLangs.length === 0) {
      return {};
    }

    const translations = {};
    const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;

    // If source language is in target languages, include original text
    if (targetLangs.includes(sourceLang)) {
      translations[sourceLang] = text;
    }

    // Filter out source language from targets
    const langsToTranslate = targetLangs.filter(lang => lang !== sourceLang);

    if (langsToTranslate.length === 0) {
      return translations;
    }

    console.log(`[TranslationManager] Translating from ${sourceLangName} to ${langsToTranslate.length} languages`);

    // Translate to each target language
    // Note: We could optimize this further with batch API if supported
    const translationPromises = langsToTranslate.map(async (targetLang) => {
      try {
        const translated = await this.translateText(text, sourceLang, targetLang, apiKey);
        return { lang: targetLang, text: translated };
      } catch (error) {
        console.error(`[TranslationManager] Failed to translate to ${targetLang}:`, error.message);
        return { lang: targetLang, text: `[Translation error: ${targetLang}]` };
      }
    });

    const results = await Promise.all(translationPromises);
    
    results.forEach(({ lang, text }) => {
      translations[lang] = text;
    });

    return translations;
  }

  /**
   * Translate text from source to target language using Gemini WebSocket API
   * Uses gemini-live-2.5-flash-preview model via WebSocket for consistency with solo mode
   */
  async translateText(text, sourceLang, targetLang, apiKey) {
    const cacheKey = `${sourceLang}:${targetLang}:${text.substring(0, 100)}`;
    
    // Check cache
    if (this.translationCache.has(cacheKey)) {
      const cached = this.translationCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 60000) { // 1 minute cache
        return cached.text;
      }
    }

    const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;
    
    // Debug: Check API key
    if (!apiKey) {
      console.error('[TranslationManager] ERROR: No API key provided!');
      throw new Error('No API key provided for translation');
    }
    console.log(`[TranslationManager] Translating: "${text.substring(0, 50)}..." (${sourceLangName} → ${targetLangName})`);

    try {
      // Use WebSocket API with gemini-live-2.5-flash-preview for translation
      const translatedText = await this.translateViaWebSocket(text, sourceLangName, targetLangName, apiKey);

      const finalText = translatedText.trim() || text; // Fallback to original if translation fails

      // Cache the result
      this.translationCache.set(cacheKey, {
        text: finalText,
        timestamp: Date.now()
      });

      // Limit cache size
      if (this.translationCache.size > 100) {
        const firstKey = this.translationCache.keys().next().value;
        this.translationCache.delete(firstKey);
      }

      return finalText;
    } catch (error) {
      console.error(`[TranslationManager] Translation error (${sourceLangName} → ${targetLangName}):`, error.message);
      throw error;
    }
  }

  /**
   * Translate text using WebSocket API (gemini-live-2.5-flash-preview)
   */
  async translateViaWebSocket(text, sourceLangName, targetLangName, apiKey) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        reject(new Error('Translation timeout'));
      }, 10000); // 10 second timeout

      const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(geminiWsUrl);
      
      let translatedText = '';
      let setupComplete = false;

      ws.on('open', () => {
        // Send setup message with translation system instruction
        const setupMessage = {
          setup: {
            model: 'models/gemini-live-2.5-flash-preview',
            generationConfig: {
              responseModalities: ['TEXT']
            },
            systemInstruction: {
              parts: [{
                text: `You are a professional translator. You will receive text in ${sourceLangName} and must translate it to ${targetLangName}.

CRITICAL RULES:
1. ONLY provide the direct translation of the text you receive
2. Do NOT include explanations like "The translation is..." or "Here's the translation"
3. Do NOT add any notes or commentary
4. Preserve the meaning, tone, and context of the original text
5. Maintain proper grammar and natural phrasing in ${targetLangName}

Example: If you receive "Hello, how are you?", respond ONLY with the ${targetLangName} translation, nothing else.`
              }]
            }
          }
        };
        
        ws.send(JSON.stringify(setupMessage));
      });

      ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          
          if (response.setupComplete) {
            setupComplete = true;
            
            // Now send the text to translate
            const textMessage = {
              clientContent: {
                turns: [{
                  role: 'user',
                  parts: [{ text: text }]
                }],
                turnComplete: true
              }
            };
            
            ws.send(JSON.stringify(textMessage));
            return;
          }

          // Process server content (translation result)
          if (response.serverContent) {
            const serverContent = response.serverContent;
            
            if (serverContent.modelTurn && serverContent.modelTurn.parts) {
              for (const part of serverContent.modelTurn.parts) {
                if (part.text) {
                  translatedText += part.text;
                }
              }
            }
            
            if (serverContent.turnComplete) {
              clearTimeout(timeout);
              ws.close();
              resolve(translatedText.trim());
            }
          }
        } catch (error) {
          console.error('[TranslationManager] WebSocket message error:', error);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        console.error('[TranslationManager] WebSocket error:', error.message);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        if (!translatedText && code !== 1000) {
          reject(new Error(`WebSocket closed with code ${code}: ${reason}`));
        } else if (translatedText) {
          resolve(translatedText.trim());
        }
      });
    });
  }

  /**
   * Get system instruction for real-time transcription
   */
  getSystemInstruction(sourceLang, targetLang) {
    const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;

    return {
      parts: [{
        text: `You are an audio transcription system. Your job is to listen to the audio and write down EXACTLY what you hear in ${sourceLangName}, word-for-word.

RULES:
- Write only what is actually spoken in the audio
- Do not make up words or content
- Do not add commentary or explanations
- If you hear "testing testing testing", write exactly that
- Listen carefully to each word

Write ONLY what you hear, nothing more, nothing less.

The transcription will be translated to other languages separately.`
      }]
    };
  }

  /**
   * Clear translation cache
   */
  clearCache() {
    this.translationCache.clear();
    console.log('[TranslationManager] Cache cleared');
  }
}

// Singleton instance
const translationManager = new TranslationManager();

export default translationManager;

