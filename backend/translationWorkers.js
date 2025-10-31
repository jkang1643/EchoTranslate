/**
 * Separate Translation Workers for Partial vs Final Translations
 * 
 * ARCHITECTURE:
 * - PartialTranslationWorker: Fast, low-latency translations for live updates
 *   - Uses faster/cheaper model (GPT-3.5-turbo or GPT-4o-mini)
 *   - Aggressive caching and debouncing
 *   - Lower temperature for consistency
 *   - Can cancel/abort if new partial arrives
 * 
 * - FinalTranslationWorker: High-quality translations for history
 *   - Uses GPT-4o for best quality
 *   - No throttling or cancellation
 *   - Full context and accuracy
 */

import fetch from 'node-fetch';

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

/**
 * Partial Translation Worker - Optimized for speed and low latency
 */
export class PartialTranslationWorker {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map(); // Track pending requests for cancellation
    this.MAX_CACHE_SIZE = 200; // Larger cache for partials
    this.CACHE_TTL = 120000; // 2 minutes cache for partials (longer since partials repeat)
  }

  /**
   * Fast translation for partial text - optimized for latency
   * Uses GPT-4o-mini or GPT-3.5-turbo for speed
   */
  async translatePartial(text, sourceLang, targetLang, apiKey) {
    if (!text || text.length < 5) {
      return text; // Too short to translate
    }

    // For longer text, use more characters in cache key to differentiate
    // Short text: first 150 chars, Long text (>300): first 300 chars
    const cacheKeyLength = text.length > 300 ? 300 : 150;
    const cacheKey = `partial:${sourceLang}:${targetLang}:${text.substring(0, cacheKeyLength)}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`[PartialWorker] ✅ Cache hit for partial`);
        return cached.text;
      }
    }

    const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

    if (!apiKey) {
      console.error('[PartialWorker] ERROR: No API key provided');
      return text;
    }

    // Cancel any pending request for this target language (newer text arrived)
    const cancelKey = `${sourceLang}:${targetLang}`;
    if (this.pendingRequests.has(cancelKey)) {
      const { abortController } = this.pendingRequests.get(cancelKey);
      abortController.abort();
      console.log(`[PartialWorker] 🚫 Cancelled previous partial translation`);
    }

    // Create abort controller for this request
    const abortController = new AbortController();
    this.pendingRequests.set(cancelKey, { abortController, text });

    try {
      console.log(`[PartialWorker] ⚡ Fast translating partial: "${text.substring(0, 40)}..." (${sourceLangName} → ${targetLangName})`);

      // Use GPT-4o-mini for fast partials (faster and cheaper than GPT-4o)
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Faster model for partials
          messages: [
            {
              role: 'system',
              content: `You are a fast real-time translator. Translate text from ${sourceLangName} to ${targetLangName}.

RULES FOR PARTIAL/INCOMPLETE TEXT:
1. Translate the partial text naturally even if sentence is incomplete
2. Maintain the same tense and context as the partial
3. Do NOT complete or extend the sentence - only translate what's given
4. Keep translation concise and natural in ${targetLangName}
5. No explanations, only the translation`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.2, // Lower temperature for consistency in partials
          max_tokens: 1000, // Increased from 500 to handle longer partials (prevents truncation)
          stream: false // No streaming for partials (simpler)
        }),
        signal: abortController.signal
      });

      // Remove from pending requests
      this.pendingRequests.delete(cancelKey);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.choices || result.choices.length === 0) {
        throw new Error('No translation result from OpenAI');
      }

      const translatedText = result.choices[0].message.content.trim() || text;

      // Cache the result
      this.cache.set(cacheKey, {
        text: translatedText,
        timestamp: Date.now()
      });

      // Limit cache size
      if (this.cache.size > this.MAX_CACHE_SIZE) {
        // Remove oldest entry
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return translatedText;
    } catch (error) {
      // Remove from pending requests
      this.pendingRequests.delete(cancelKey);

      if (error.name === 'AbortError') {
        console.log(`[PartialWorker] 🚫 Translation aborted (newer text arrived)`);
        return text; // Return original on abort
      }

      console.error(`[PartialWorker] Translation error:`, error.message);
      return text; // Fallback to original
    }
  }

  /**
   * Translate to multiple languages (for partials)
   */
  async translateToMultipleLanguages(text, sourceLang, targetLangs, apiKey) {
    if (!text || targetLangs.length === 0) {
      return {};
    }

    const translations = {};

    // If source language is in target languages, include original text
    if (targetLangs.includes(sourceLang)) {
      translations[sourceLang] = text;
    }

    // Filter out source language from targets
    const langsToTranslate = targetLangs.filter(lang => lang !== sourceLang);

    if (langsToTranslate.length === 0) {
      return translations;
    }

    // Translate to each target language in parallel for speed
    const translationPromises = langsToTranslate.map(async (targetLang) => {
      try {
        const translated = await this.translatePartial(text, sourceLang, targetLang, apiKey);
        return { lang: targetLang, text: translated };
      } catch (error) {
        console.error(`[PartialWorker] Failed to translate to ${targetLang}:`, error.message);
        return { lang: targetLang, text: text }; // Fallback to original
      }
    });

    const results = await Promise.all(translationPromises);
    
    results.forEach(({ lang, text }) => {
      translations[lang] = text;
    });

    return translations;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.pendingRequests.clear();
    console.log('[PartialWorker] Cache cleared');
  }
}

/**
 * Final Translation Worker - Optimized for quality and accuracy
 */
export class FinalTranslationWorker {
  constructor() {
    this.cache = new Map();
    this.MAX_CACHE_SIZE = 100;
    this.CACHE_TTL = 600000; // 10 minutes cache for finals (longer since they're stable)
  }

  /**
   * High-quality translation for final text - optimized for accuracy
   * Uses GPT-4o for best quality
   */
  async translateFinal(text, sourceLang, targetLang, apiKey) {
    if (!text || text.trim().length === 0) {
      return text;
    }

    const cacheKey = `final:${sourceLang}:${targetLang}:${text.substring(0, 200)}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`[FinalWorker] ✅ Cache hit for final`);
        return cached.text;
      }
    }

    const sourceLangName = LANGUAGE_NAMES[sourceLang] || sourceLang;
    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;

    if (!apiKey) {
      console.error('[FinalWorker] ERROR: No API key provided');
      throw new Error('No OpenAI API key provided for translation');
    }

    console.log(`[FinalWorker] 🎯 High-quality translating final: "${text.substring(0, 50)}..." (${sourceLangName} → ${targetLangName})`);

    try {
      // Use GPT-4o for high-quality final translations
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o', // Best model for final quality
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate text from ${sourceLangName} to ${targetLangName}.

CRITICAL RULES:
1. ONLY provide the direct translation - no explanations
2. Do NOT include phrases like "The translation is..." or "Here's the translation"
3. Do NOT add any notes or commentary
4. Preserve the meaning, tone, and context
5. Maintain proper grammar and natural phrasing in ${targetLangName}
6. Keep the same level of formality as the original
7. Ensure complete and accurate translation

Output: Only the translated text in ${targetLangName}.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.3, // Balanced temperature for quality
          max_tokens: 2000 // More tokens for complete sentences
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.choices || result.choices.length === 0) {
        throw new Error('No translation result from OpenAI');
      }

      const translatedText = result.choices[0].message.content.trim() || text;

      // Cache the result
      this.cache.set(cacheKey, {
        text: translatedText,
        timestamp: Date.now()
      });

      // Limit cache size
      if (this.cache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return translatedText;
    } catch (error) {
      console.error(`[FinalWorker] Translation error:`, error.message);
      throw error;
    }
  }

  /**
   * Translate to multiple languages (for finals)
   */
  async translateToMultipleLanguages(text, sourceLang, targetLangs, apiKey) {
    if (!text || targetLangs.length === 0) {
      return {};
    }

    const translations = {};

    // If source language is in target languages, include original text
    if (targetLangs.includes(sourceLang)) {
      translations[sourceLang] = text;
    }

    // Filter out source language from targets
    const langsToTranslate = targetLangs.filter(lang => lang !== sourceLang);

    if (langsToTranslate.length === 0) {
      return translations;
    }

    // Translate to each target language in parallel
    const translationPromises = langsToTranslate.map(async (targetLang) => {
      try {
        const translated = await this.translateFinal(text, sourceLang, targetLang, apiKey);
        return { lang: targetLang, text: translated };
      } catch (error) {
        console.error(`[FinalWorker] Failed to translate to ${targetLang}:`, error.message);
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
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[FinalWorker] Cache cleared');
  }
}

// Export singleton instances
export const partialTranslationWorker = new PartialTranslationWorker();
export const finalTranslationWorker = new FinalTranslationWorker();

