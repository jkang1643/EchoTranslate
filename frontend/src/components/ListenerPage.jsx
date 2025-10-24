/**
 * Listener Page - For audience members to receive live translations
 */

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Header } from './Header';
import { ConnectionStatus } from './ConnectionStatus';
import { LanguageSelector } from './LanguageSelector';
import { SentenceSegmenter } from '../utils/sentenceSegmenter';

// Dynamically determine backend URL based on frontend URL
// If accessing via network IP, use the same IP for backend
const getBackendUrl = () => {
  const hostname = window.location.hostname;
  console.log('[ListenerPage] Detected hostname:', hostname);
  
  // Validate IP address format
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  if (hostname !== 'localhost' && !ipv4Pattern.test(hostname)) {
    console.error('[ListenerPage] Invalid hostname format, using localhost');
    return 'http://localhost:3001';
  }
  
  return `http://${hostname}:3001`;
};

const getWebSocketUrl = () => {
  const hostname = window.location.hostname;
  
  // Validate IP address format
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  if (hostname !== 'localhost' && !ipv4Pattern.test(hostname)) {
    console.error('[ListenerPage] Invalid hostname format, using localhost');
    return 'ws://localhost:3001';
  }
  
  return `ws://${hostname}:3001`;
};

const API_URL = import.meta.env.VITE_API_URL || getBackendUrl();
const WS_URL = import.meta.env.VITE_WS_URL || getWebSocketUrl();

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'bn', name: 'Bengali' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'el', name: 'Greek' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'he', name: 'Hebrew' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'fa', name: 'Persian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'sw', name: 'Swahili' },
  { code: 'fil', name: 'Filipino' },
  { code: 'ms', name: 'Malay' },
  { code: 'ca', name: 'Catalan' },
  { code: 'sk', name: 'Slovak' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'et', name: 'Estonian' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'af', name: 'Afrikaans' }
];

export function ListenerPage({ sessionCodeProp, onBackToHome }) {
  const [sessionCode, setSessionCode] = useState(sessionCodeProp || '');
  const [isJoined, setIsJoined] = useState(false);
  const [userName, setUserName] = useState('');
  const [targetLang, setTargetLang] = useState('es');
  const [connectionState, setConnectionState] = useState('disconnected');
  const [translations, setTranslations] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState(''); // Live partial translation
  const [sessionInfo, setSessionInfo] = useState(null);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const wsRef = useRef(null);
  const translationsEndRef = useRef(null);
  
  // Throttling refs for smooth partial updates (20fps max)
  const lastUpdateTimeRef = useRef(0);
  const pendingTextRef = useRef(null);
  const throttleTimerRef = useRef(null);
  
  // Sentence segmenter for smart text management
  const segmenterRef = useRef(null);
  if (!segmenterRef.current) {
    segmenterRef.current = new SentenceSegmenter({
      maxSentences: 3,
      maxChars: 500,
      maxTimeMs: 15000,
      onFlush: (flushedSentences) => {
        const joinedText = flushedSentences.join(' ').trim();
        if (joinedText) {
          setTranslations(prev => [...prev, {
            original: '',
            translated: joinedText,
            timestamp: Date.now()
          }].slice(-50));
        }
      }
    });
  }

  // Auto-scroll to latest translation
  useEffect(() => {
    translationsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [translations]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleJoinSession = async () => {
    if (!sessionCode.trim()) {
      setError('Please enter a session code');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: sessionCode.toUpperCase(),
          targetLang: targetLang,
          userName: userName || 'Anonymous'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSessionInfo(data);
        setIsJoined(true);
        
        // Connect WebSocket
        connectWebSocket(data.sessionId, targetLang, userName || 'Anonymous');
      } else {
        setError(data.error || 'Failed to join session');
      }
    } catch (err) {
      console.error('Failed to join session:', err);
      setError('Failed to join session. Please check your connection.');
    } finally {
      setIsJoining(false);
    }
  };

  const connectWebSocket = (sessionId, lang, name) => {
    const ws = new WebSocket(
      `${WS_URL}/translate?role=listener&sessionId=${sessionId}&targetLang=${lang}&userName=${encodeURIComponent(name)}`
    );
    
    ws.onopen = () => {
      console.log('[Listener] WebSocket connected');
      setConnectionState('open');
    };
    
    ws.onclose = () => {
      console.log('[Listener] WebSocket disconnected');
      setConnectionState('closed');
      setError('Disconnected from session');
    };
    
    ws.onerror = (error) => {
      console.error('[Listener] WebSocket error:', error);
      setConnectionState('error');
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'session_joined':
            console.log('[Listener] Joined session:', message.sessionCode);
            break;
          
          case 'translation':
            // ✨ REAL-TIME STREAMING: Sentence segmented + throttled display
            if (message.isPartial) {
              const rawText = message.translatedText || message.originalText;
              const now = Date.now();
              
              // Process through segmenter (auto-flushes complete sentences)
              const { liveText } = segmenterRef.current.processPartial(rawText);
              
              // Store the segmented text
              pendingTextRef.current = liveText;
              
              // THROTTLE: Update max 20 times per second (50ms intervals)
              const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
              
              if (timeSinceLastUpdate >= 50) {
                // Immediate update with forced sync render
                lastUpdateTimeRef.current = now;
                flushSync(() => {
                  setCurrentTranslation(liveText);
                });
              } else {
                // Schedule delayed update
                if (throttleTimerRef.current) {
                  clearTimeout(throttleTimerRef.current);
                }
                
                throttleTimerRef.current = setTimeout(() => {
                  const latestText = pendingTextRef.current;
                  if (latestText !== null) {
                    lastUpdateTimeRef.current = Date.now();
                    flushSync(() => {
                      setCurrentTranslation(latestText);
                    });
                  }
                }, 50);
              }
            } else {
              // Final translation - process through segmenter (deduplicated)
              const finalText = message.translatedText;
              const { flushedSentences } = segmenterRef.current.processFinal(finalText);
              
              // Add deduplicated sentences to history
              if (flushedSentences.length > 0) {
                const joinedText = flushedSentences.join(' ').trim();
                setTranslations(prev => [...prev, {
                  original: message.originalText,
                  translated: joinedText,
                  timestamp: message.timestamp
                }].slice(-50));
              }
              
              setCurrentTranslation('');
            }
            break;
          
          case 'session_ended':
            setError('The host has ended the session');
            setConnectionState('closed');
            break;
          
          case 'error':
            console.error('[Listener] Error:', message.message);
            setError(message.message);
            break;
        }
      } catch (err) {
        console.error('[Listener] Failed to parse message:', err);
      }
    };
    
    wsRef.current = ws;
  };

  const handleChangeLanguage = (newLang) => {
    setTargetLang(newLang);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'change_language',
        targetLang: newLang
      }));
      
      // Clear old translations and current text when changing language
      setTranslations([]);
      setCurrentTranslation('');
    }
  };

  const handleLeaveSession = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsJoined(false);
    setSessionCode('');
    setTranslations([]);
    setCurrentTranslation('');
    setConnectionState('disconnected');
  };

  // Join form
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
        <Header />
        
        <div className="container mx-auto px-4 py-8">
          <button
            onClick={onBackToHome}
            className="mb-4 px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center gap-2"
          >
            ← Back to Home
          </button>

          <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-3xl font-bold mb-6 text-gray-800 text-center">
              Join Translation Session
            </h2>
            
            {error && (
              <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Session Code Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Session Code
                </label>
                <input
                  type="text"
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="w-full px-4 py-3 text-2xl font-bold text-center tracking-wider border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none uppercase"
                />
              </div>

              {/* User Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Anonymous"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Language Selection */}
              <div>
                <LanguageSelector
                  label="Translation Language"
                  languages={LANGUAGES}
                  selectedLanguage={targetLang}
                  onLanguageChange={setTargetLang}
                />
              </div>

              {/* Join Button */}
              <button
                onClick={handleJoinSession}
                disabled={isJoining || !sessionCode.trim()}
                className="w-full px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:scale-100"
              >
                {isJoining ? 'Joining...' : 'Join Session'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Listener view (after joining)
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Session Info Bar */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-600">Session Code:</p>
              <p className="text-2xl font-bold text-emerald-600">{sessionInfo?.sessionCode}</p>
            </div>
            
            <div className="flex-1 max-w-xs">
              <LanguageSelector
                label="Your Language"
                languages={LANGUAGES}
                selectedLanguage={targetLang}
                onLanguageChange={handleChangeLanguage}
              />
            </div>

            <ConnectionStatus state={connectionState} />
            
            <button
              onClick={handleLeaveSession}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-all"
            >
              Leave Session
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* LIVE STREAMING TRANSLATION BOX - Shows text as it arrives word-by-word */}
        <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 rounded-2xl p-6 shadow-2xl mb-6">
          <div className="flex items-center space-x-3 mb-4">
            {connectionState === 'open' && (
              <div className="flex space-x-1">
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce"></div>
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce" style={{animationDelay: '0.15s'}}></div>
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce" style={{animationDelay: '0.3s'}}></div>
              </div>
            )}
            <span className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              {connectionState === 'open' ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                  </span>
                  LIVE TRANSLATION
                </>
              ) : (
                'CONNECTING...'
              )}
            </span>
          </div>
          
          <div className="bg-white/95 backdrop-blur rounded-xl p-6 min-h-[140px] max-h-[400px] overflow-y-auto transition-none scroll-smooth">
            {currentTranslation ? (
              <p className="text-gray-900 font-semibold text-3xl leading-relaxed tracking-wide break-words">
                {currentTranslation}
                {connectionState === 'open' && (
                  <span className="inline-block w-1 h-8 ml-2 bg-green-600 animate-pulse"></span>
                )}
              </p>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[140px]">
                <p className="text-gray-400 text-xl">
                  {connectionState === 'open' ? 'Listening for host...' : 'Connecting to session...'}
                </p>
              </div>
            )}
          </div>
          
          <div className="mt-3 text-xs text-white/80 font-medium">
            {currentTranslation ? 
              'Words update in real-time • Translation synchronized with host' : 
              'Waiting for host to speak'
            }
          </div>
        </div>

        {/* Translation History */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
            <span className="text-green-600">📝</span>
            History
            {translations.length > 0 && (
              <span className="text-sm text-gray-500 font-normal">
                ({translations.length} {translations.length === 1 ? 'segment' : 'segments'})
              </span>
            )}
          </h3>
          
          {translations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">No completed translations yet</p>
              <p className="text-sm mt-2">Translations will appear here after each phrase is complete</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {translations.map((item, index) => (
                <div key={index} className="p-4 bg-emerald-50 rounded-lg border-l-4 border-emerald-500">
                  <p className="text-lg text-gray-800 font-medium">{item.translated}</p>
                  
                  {/* Optional: Show original text in collapsed view */}
                  {item.original && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                        View original
                      </summary>
                      <p className="text-sm text-gray-600 mt-1 italic">{item.original}</p>
                    </details>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))}
              <div ref={translationsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

