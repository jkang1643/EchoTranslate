/**
 * Host Page - For the speaker/preacher to broadcast live translations
 */

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { Header } from './Header';
import { ConnectionStatus } from './ConnectionStatus';
import { LanguageSelector } from './LanguageSelector';
import AudioDebugSettings from './AudioDebugSettings';

// Dynamically determine backend URL based on frontend URL
// If accessing via network IP, use the same IP for backend
const getBackendUrl = () => {
  const hostname = window.location.hostname;
  console.log('[HostPage] Detected hostname:', hostname);
  
  // Validate IP address format
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  if (hostname !== 'localhost' && !ipv4Pattern.test(hostname)) {
    console.error('[HostPage] Invalid hostname format, using localhost');
    return 'http://localhost:3001';
  }
  
  return `http://${hostname}:3001`;
};

const getWebSocketUrl = () => {
  const hostname = window.location.hostname;
  
  // Validate IP address format
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  if (hostname !== 'localhost' && !ipv4Pattern.test(hostname)) {
    console.error('[HostPage] Invalid hostname format, using localhost');
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

export function HostPage({ onBackToHome }) {
  const [sessionCode, setSessionCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [sourceLang, setSourceLang] = useState('en');
  const [connectionState, setConnectionState] = useState('disconnected');
  const [transcript, setTranscript] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);
  const [languageStats, setLanguageStats] = useState({});
  const [error, setError] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [maxStreamDuration, setMaxStreamDuration] = useState(3); // Default 3 seconds
  
  // Audio debug settings with localStorage persistence
  // Default: Optimized for preaching/sermons
  const getInitialAudioSettings = () => {
    try {
      const saved = localStorage.getItem('audioDebugSettings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('Failed to load audio settings:', err);
    }
    return {
      maxQueueSize: 10,
      maxSegmentMs: 1500,
      minSegmentMs: 500,
      silenceTimeoutMs: 700,
      silenceThreshold: 0.005,
      overlapMs: 150,
      workerIntervalMs: 100,
      sampleRate: 16000
    };
  };
  
  const [audioSettings, setAudioSettings] = useState(getInitialAudioSettings());

  const wsRef = useRef(null);
  const { startRecording, stopRecording, isRecording, audioLevel, updateConfig } = useAudioCapture();
  
  // Save audio settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('audioDebugSettings', JSON.stringify(audioSettings));
    } catch (err) {
      console.error('Failed to save audio settings:', err);
    }
  }, [audioSettings]);

  // Create session on mount
  useEffect(() => {
    createSession();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const createSession = async () => {
    try {
      const response = await fetch(`${API_URL}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      
      if (data.success) {
        setSessionId(data.sessionId);
        setSessionCode(data.sessionCode);
        
        // Generate QR code with join URL
        const joinUrl = `${window.location.origin}?join=${data.sessionCode}`;
        const qrUrl = await QRCode.toDataURL(joinUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        setQrDataUrl(qrUrl);
        
        // Connect WebSocket
        connectWebSocket(data.sessionId);
      } else {
        setError('Failed to create session');
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      setError('Failed to create session. Please check your connection.');
    }
  };

  const connectWebSocket = (sessionId) => {
    const ws = new WebSocket(`${WS_URL}/translate?role=host&sessionId=${sessionId}`);
    
    ws.onopen = () => {
      console.log('[Host] WebSocket connected');
      setConnectionState('open');
      
      // Send initialization
      ws.send(JSON.stringify({
        type: 'init',
        sourceLang: sourceLang,
        maxStreamDuration: maxStreamDuration * 1000 // Convert to milliseconds
      }));
    };
    
    ws.onclose = () => {
      console.log('[Host] WebSocket disconnected');
      setConnectionState('closed');
    };
    
    ws.onerror = (error) => {
      console.error('[Host] WebSocket error:', error);
      setConnectionState('error');
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'session_ready':
            console.log('[Host] Session ready:', message.sessionCode);
            break;
          
          case 'gemini_ready':
            console.log('[Host] Gemini ready for audio');
            break;
          
          case 'transcript':
            // Add transcript to display
            setTranscript(prev => [...prev, {
              text: message.text,
              timestamp: message.timestamp
            }].slice(-10)); // Keep last 10 transcripts
            break;
          
          case 'session_stats':
            if (message.stats) {
              setListenerCount(message.stats.listenerCount || 0);
              setLanguageStats(message.stats.languageCounts || {});
            }
            break;
          
          case 'error':
            console.error('[Host] Error:', message.message);
            setError(message.message);
            break;
        }
      } catch (err) {
        console.error('[Host] Failed to parse message:', err);
      }
    };
    
    wsRef.current = ws;
  };

  const handleStartBroadcast = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected');
      return;
    }

    try {
      await startRecording((audioData, metadata) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            audioData: audioData,
            streaming: true,
            metadata: metadata || {}
          }));
        }
      }, true, audioSettings); // streaming mode with custom audio settings
      
      setIsStreaming(true);
      setError('');
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to access microphone. Please check permissions.');
    }
  };
  
  const handleAudioSettingsChange = (newSettings) => {
    setAudioSettings(newSettings);
    // If recording, update config in real-time
    if (isStreaming) {
      updateConfig(newSettings);
      console.log('[HostPage] Updated audio config during streaming:', newSettings);
    }
  };

  const handleStopBroadcast = () => {
    // Pass callback to flush remaining audio
    stopRecording((audioData, metadata) => {
      if (audioData && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'audio',
          audioData: audioData,
          streaming: true,
          metadata: metadata || {}
        }));
      }
    });
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_end'
      }));
    }
    
    setIsStreaming(false);
  };

  const handleSourceLangChange = (lang) => {
    setSourceLang(lang);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'init',
        sourceLang: lang,
        maxStreamDuration: maxStreamDuration * 1000 // Convert to milliseconds
      }));
    }
  };

  const handleMaxStreamDurationChange = (duration) => {
    setMaxStreamDuration(duration);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'init',
        sourceLang: sourceLang,
        maxStreamDuration: duration * 1000 // Convert to milliseconds
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={onBackToHome}
          className="mb-4 px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center gap-2"
        >
          ← Back to Home
        </button>

        {/* Session Info Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Live Translation Session - Host</h2>
          
          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Session Code Display */}
          {sessionCode && (
            <div className="mb-6 text-center">
              <p className="text-gray-600 mb-2">Session Code:</p>
              <div className="text-5xl font-bold text-indigo-600 tracking-wider mb-4">
                {sessionCode}
              </div>
              
              {/* QR Code */}
              {qrDataUrl && (
                <div className="flex flex-col items-center gap-2">
                  <img src={qrDataUrl} alt="QR Code" className="border-4 border-gray-200 rounded-lg" />
                  <p className="text-sm text-gray-500">Listeners can scan this code to join</p>
                </div>
              )}
            </div>
          )}

          {/* Connection Status */}
          <ConnectionStatus state={connectionState} />

          {/* Language Selection */}
          <div className="mb-6">
            <LanguageSelector
              label="Speaking Language"
              languages={LANGUAGES}
              selectedLanguage={sourceLang}
              onLanguageChange={handleSourceLangChange}
            />
          </div>

          {/* Advanced Settings */}
          <div className="mb-6">
            <button
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-2"
            >
              <span>{showAdvancedSettings ? '▼' : '▶'}</span>
              <span>Advanced Settings</span>
            </button>
            
            {showAdvancedSettings && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="space-y-4">
                  {/* Max Stream Duration Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        Translation Update Interval
                      </label>
                      <span className="text-sm font-semibold text-indigo-600">
                        {maxStreamDuration}s
                      </span>
                    </div>
                    
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={maxStreamDuration}
                      onChange={(e) => handleMaxStreamDurationChange(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      disabled={isStreaming}
                    />
                    
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1s (Fast)</span>
                      <span>10s (Slow)</span>
                    </div>
                    
                    <p className="text-xs text-gray-600 mt-2">
                      Controls how frequently translations are sent. Lower values provide faster updates 
                      but may cut sentences. Higher values wait longer for complete sentences.
                      {isStreaming && (
                        <span className="block text-amber-600 mt-1">
                          ⚠️ Stop broadcasting to change this setting
                        </span>
                      )}
                    </p>
                  </div>
                  
                  {/* Audio Settings - Integrated */}
                  <div className="border-t border-gray-200 pt-4">
                    <AudioDebugSettings
                      settings={audioSettings}
                      onSettingsChange={handleAudioSettingsChange}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Broadcast Controls */}
          <div className="flex justify-center gap-4 mb-6">
            {!isStreaming ? (
              <button
                onClick={handleStartBroadcast}
                disabled={connectionState !== 'open'}
                className="px-8 py-4 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:scale-100"
              >
                🎙️ Start Broadcasting
              </button>
            ) : (
              <button
                onClick={handleStopBroadcast}
                className="px-8 py-4 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105"
              >
                ⏹️ Stop Broadcasting
              </button>
            )}
          </div>

          {/* Audio Level Indicator */}
          {isStreaming && (
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-2">Audio Level:</p>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all duration-100"
                  style={{ width: `${audioLevel * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Listener Stats */}
          <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-2">📊 Listener Statistics</h3>
            <p className="text-2xl font-bold text-indigo-600">{listenerCount} Listeners</p>
            
            {Object.keys(languageStats).length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-gray-600 mb-1">By Language:</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(languageStats).map(([lang, count]) => (
                    <div key={lang} className="flex justify-between text-sm">
                      <span className="text-gray-700">{lang}:</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Transcript */}
        {transcript.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-800">Live Transcript</h3>
            <div className="space-y-3">
              {transcript.map((item, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded border-l-4 border-indigo-500">
                  <p className="text-gray-800">{item.text}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

