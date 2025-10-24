/**
 * Google Cloud Speech-to-Text Streaming Service
 * Provides live streaming transcription with partial results
 * 
 * This replaces OpenAI Realtime API with Google's superior streaming transcription
 * which provides true word-by-word partial results with high accuracy.
 * 
 * AUTHENTICATION OPTIONS:
 * 1. Service Account JSON (default) - More secure, recommended for production
 * 2. API Key (simpler) - Set GOOGLE_SPEECH_API_KEY env variable
 */

import speech from '@google-cloud/speech';
import { Buffer } from 'buffer';

const LANGUAGE_CODES = {
  'en': 'en-US',
  'es': 'es-ES',
  'fr': 'fr-FR',
  'de': 'de-DE',
  'it': 'it-IT',
  'pt': 'pt-PT',
  'pt-BR': 'pt-BR',
  'ru': 'ru-RU',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'zh': 'zh-CN',
  'zh-TW': 'zh-TW',
  'ar': 'ar-SA',
  'hi': 'hi-IN',
  'nl': 'nl-NL',
  'pl': 'pl-PL',
  'tr': 'tr-TR',
  'bn': 'bn-IN',
  'vi': 'vi-VN',
  'th': 'th-TH',
  'id': 'id-ID',
  'sv': 'sv-SE',
  'no': 'no-NO',
  'da': 'da-DK',
  'fi': 'fi-FI',
  'el': 'el-GR',
  'cs': 'cs-CZ',
  'ro': 'ro-RO',
  'hu': 'hu-HU',
  'he': 'he-IL',
  'uk': 'uk-UA',
  'fa': 'fa-IR',
  'ur': 'ur-PK',
  'ta': 'ta-IN',
  'te': 'te-IN',
  'mr': 'mr-IN',
  'gu': 'gu-IN',
  'kn': 'kn-IN',
  'ml': 'ml-IN',
  'sw': 'sw-KE',
  'fil': 'fil-PH',
  'ms': 'ms-MY',
  'ca': 'ca-ES',
  'sk': 'sk-SK',
  'bg': 'bg-BG',
  'hr': 'hr-HR',
  'sr': 'sr-RS',
  'lt': 'lt-LT',
  'lv': 'lv-LV',
  'et': 'et-EE',
  'sl': 'sl-SI',
  'af': 'af-ZA'
};

export class GoogleSpeechStream {
  constructor() {
    this.client = null;
    this.stream = null;
    this.recognizeStream = null;
    this.resultCallback = null;
    this.errorCallback = null;
    this.isActive = false;
    this.languageCode = 'en-US';
    this.restartTimer = null;
    this.restartCount = 0;
    this.audioQueue = [];
    this.isSending = false;
    this.shouldAutoRestart = true;
    this.lastAudioTime = null;
    
    // Google Speech has a 305 second (5 min) streaming limit
    // We'll restart the stream every 4 minutes to be safe
    this.STREAMING_LIMIT = 240000; // 4 minutes in milliseconds
    this.startTime = Date.now();
  }

  /**
   * Initialize the Google Speech client and start streaming
   */
  async initialize(sourceLang) {
    console.log(`[GoogleSpeech] Initializing streaming transcription for ${sourceLang}...`);
    
    // Create Speech client with authentication options
    const clientOptions = {};
    
    // Option 1: API Key (simpler, if provided)
    if (process.env.GOOGLE_SPEECH_API_KEY) {
      console.log('[GoogleSpeech] Using API Key authentication');
      clientOptions.apiKey = process.env.GOOGLE_SPEECH_API_KEY;
    } 
    // Option 2: Service Account JSON (via GOOGLE_APPLICATION_CREDENTIALS env var)
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('[GoogleSpeech] Using Service Account JSON authentication');
      // Default behavior - uses credentials file path from env var
    }
    // Option 3: Default credentials (for GCP environments)
    else {
      console.log('[GoogleSpeech] Using default credentials (GCP environment)');
    }
    
    this.client = new speech.SpeechClient(clientOptions);
    
    // Get language code for Google Speech
    this.languageCode = LANGUAGE_CODES[sourceLang] || LANGUAGE_CODES[sourceLang.split('-')[0]] || 'en-US';
    console.log(`[GoogleSpeech] Using language code: ${this.languageCode}`);
    
    // Start the streaming session
    await this.startStream();
    
    console.log(`[GoogleSpeech] ✅ Streaming initialized and ready`);
  }

  /**
   * Start a new streaming recognition session
   */
  async startStream() {
    if (this.recognizeStream) {
      console.log('[GoogleSpeech] Closing existing stream before restart...');
      this.recognizeStream.end();
      this.recognizeStream = null;
    }

    console.log(`[GoogleSpeech] Starting stream #${this.restartCount}...`);
    this.startTime = Date.now();
    this.isActive = true;

    const request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 24000, // Match frontend audio capture
        languageCode: this.languageCode,
        enableAutomaticPunctuation: true,
        useEnhanced: true,
        model: 'latest_long', // Use latest_long model for best accuracy
        // Enable Chirp 3 model if available
        alternativeLanguageCodes: [],
      },
      interimResults: true, // CRITICAL: Enable partial results
    };

    // Create streaming recognition stream
    this.recognizeStream = this.client
      .streamingRecognize(request)
      .on('error', (error) => {
        console.error('[GoogleSpeech] Stream error:', error);
        
        // Handle common errors
        if (error.code === 11) {
          console.log('[GoogleSpeech] Audio timeout - restarting stream...');
          this.restartStream();
        } else if (error.code === 3) {
          console.error('[GoogleSpeech] Invalid argument error - check audio format');
        } else {
          console.error('[GoogleSpeech] Unhandled error:', error.message);
        }
        
        // Notify caller of error if callback exists
        if (this.errorCallback) {
          this.errorCallback(error);
        }
      })
      .on('data', (data) => {
        this.handleStreamingResponse(data);
      })
      .on('end', () => {
        console.log('[GoogleSpeech] Stream ended');
        this.isActive = false;
        
        // Auto-restart if ended unexpectedly
        if (this.shouldAutoRestart) {
          console.log('[GoogleSpeech] Stream ended unexpectedly, restarting...');
          setTimeout(() => this.restartStream(), 1000);
        }
      });

    // Set up automatic restart before hitting the time limit
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }
    
    this.restartTimer = setTimeout(() => {
      console.log('[GoogleSpeech] Approaching time limit, restarting stream...');
      this.restartStream();
    }, this.STREAMING_LIMIT);

    console.log('[GoogleSpeech] Stream started successfully');
  }

  /**
   * Restart the stream (for long sessions)
   */
  async restartStream() {
    this.restartCount++;
    console.log(`[GoogleSpeech] 🔄 Restarting stream (restart #${this.restartCount})...`);
    
    // Mark as inactive during restart
    this.isActive = false;
    
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    
    // Small delay to ensure clean shutdown
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await this.startStream();
      
      // Process any queued audio after restart
      if (this.audioQueue.length > 0) {
        console.log(`[GoogleSpeech] Processing ${this.audioQueue.length} queued audio chunks...`);
        const queuedAudio = [...this.audioQueue];
        this.audioQueue = [];
        
        for (const audioData of queuedAudio) {
          await this.processAudio(audioData);
        }
      }
    } catch (error) {
      console.error('[GoogleSpeech] Failed to restart stream:', error);
      
      // Notify error callback
      if (this.errorCallback) {
        this.errorCallback(error);
      }
    }
  }

  /**
   * Handle streaming response from Google Speech
   */
  handleStreamingResponse(data) {
    if (!data.results || data.results.length === 0) {
      return;
    }

    const result = data.results[0];
    if (!result.alternatives || result.alternatives.length === 0) {
      return;
    }

    const transcript = result.alternatives[0].transcript;
    const isFinal = result.isFinal;
    const stability = result.stability || 0;

    if (isFinal) {
      // Final result - high confidence
      console.log(`[GoogleSpeech] ✅ FINAL: "${transcript}"`);
      if (this.resultCallback) {
        this.resultCallback(transcript, false); // isPartial = false
      }
    } else {
      // Interim result - partial transcription
      // console.log(`[GoogleSpeech] 🔵 PARTIAL (stability: ${stability.toFixed(2)}): "${transcript}"`);
      if (this.resultCallback) {
        this.resultCallback(transcript, true); // isPartial = true
      }
    }
  }

  /**
   * Process audio chunk - send to Google Speech
   * @param {string} audioData - Base64 encoded PCM audio
   */
  async processAudio(audioData) {
    if (!this.isActive || !this.recognizeStream) {
      console.warn('[GoogleSpeech] Stream not active, buffering audio...');
      this.audioQueue.push(audioData);
      
      // Try to restart if stream is dead
      if (!this.isActive) {
        console.log('[GoogleSpeech] Attempting to restart inactive stream...');
        await this.restartStream();
      }
      return;
    }

    try {
      // Track last audio time for timeout detection
      this.lastAudioTime = Date.now();
      
      // Check if we need to restart due to time limit
      const elapsedTime = Date.now() - this.startTime;
      if (elapsedTime >= this.STREAMING_LIMIT) {
        console.log('[GoogleSpeech] Time limit reached, restarting stream...');
        await this.restartStream();
        return;
      }

      // Convert base64 to Buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Send audio to Google Speech
      if (this.recognizeStream && this.recognizeStream.writable) {
        this.recognizeStream.write(audioBuffer);
      } else {
        console.warn('[GoogleSpeech] Stream not writable, restarting...');
        await this.restartStream();
      }
    } catch (error) {
      console.error('[GoogleSpeech] Error processing audio:', error);
      
      // Try to restart on error
      if (this.isActive) {
        console.log('[GoogleSpeech] Attempting restart after audio processing error...');
        await this.restartStream();
      }
    }
  }

  /**
   * Set callback for results (partial and final)
   * @param {Function} callback - (transcript, isPartial) => void
   */
  onResult(callback) {
    this.resultCallback = callback;
  }
  
  /**
   * Set callback for errors
   * @param {Function} callback - (error) => void
   */
  onError(callback) {
    this.errorCallback = callback;
  }

  /**
   * End the current audio stream (pause/stop speaking)
   */
  async endAudio() {
    console.log('[GoogleSpeech] Audio stream ended by client');
    // Don't close the stream, just wait for next audio
    // Google Speech will automatically finalize the current utterance
  }

  /**
   * Force commit current audio (simulate pause)
   */
  async forceCommit() {
    console.log('[GoogleSpeech] Force commit requested - restarting stream');
    // Restart stream to force finalization
    await this.restartStream();
  }

  /**
   * Clean up and close the stream
   */
  destroy() {
    console.log('[GoogleSpeech] Destroying stream...');
    
    this.isActive = false;
    
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    
    if (this.recognizeStream) {
      this.recognizeStream.end();
      this.recognizeStream = null;
    }
    
    this.audioQueue = [];
    this.resultCallback = null;
    
    console.log('[GoogleSpeech] Stream destroyed');
  }

  /**
   * Get stream statistics
   */
  getStats() {
    return {
      isActive: this.isActive,
      restartCount: this.restartCount,
      elapsedTime: Date.now() - this.startTime,
      queuedAudio: this.audioQueue.length,
      languageCode: this.languageCode
    };
  }
}

