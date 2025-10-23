import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Globe, Settings, ArrowLeft } from 'lucide-react'
import { LanguageSelector } from './LanguageSelector'
import TranslationDisplay from './TranslationDisplay'
import { ConnectionStatus } from './ConnectionStatus'
import { Header } from './Header'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAudioCapture } from '../hooks/useAudioCapture'
import AudioDebugSettings from './AudioDebugSettings'
import { getAvailableAudioInputModes, getRecommendedAudioMode, getDeviceType } from '../utils/deviceDetection'

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
]

function TranslationInterface({ onBackToHome }) {
  const [isListening, setIsListening] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('es')
  const [translations, setTranslations] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [latency, setLatency] = useState(0)
  const [maxStreamDuration, setMaxStreamDuration] = useState(3) // Default 3 seconds
  
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
  
  const [audioSettings, setAudioSettings] = useState(getInitialAudioSettings())
  
  // Audio input mode (microphone or system audio)
  const [audioInputMode, setAudioInputMode] = useState(getRecommendedAudioMode())
  const [availableAudioModes] = useState(getAvailableAudioInputModes())
  const [deviceType] = useState(getDeviceType())
  const [activeInputSource, setActiveInputSource] = useState(null)

  // Dynamically determine WebSocket URL based on frontend URL
  const getWebSocketUrl = () => {
    const hostname = window.location.hostname;
    console.log('[TranslationInterface] Detected hostname:', hostname);
    console.log('[TranslationInterface] Full location:', window.location.href);
    
    // Validate IP address format
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    if (hostname !== 'localhost' && !ipv4Pattern.test(hostname)) {
      console.error('[TranslationInterface] Invalid hostname format, using localhost');
      return 'ws://localhost:3001/translate';
    }
    
    const wsUrl = `ws://${hostname}:3001/translate`;
    console.log('[TranslationInterface] Constructed WebSocket URL:', wsUrl);
    return wsUrl;
  };

  // Get the WebSocket URL - ensure it has /translate path
  const websocketUrl = import.meta.env.VITE_WS_URL || getWebSocketUrl();
  // Force /translate path if not present
  const finalWebSocketUrl = websocketUrl.endsWith('/translate') ? websocketUrl : websocketUrl + '/translate';
  console.log('[TranslationInterface] Final WebSocket URL being used:', finalWebSocketUrl);

  const { 
    connect, 
    disconnect, 
    sendMessage, 
    connectionState,
    addMessageHandler
  } = useWebSocket(finalWebSocketUrl)

  const {
    startRecording,
    stopRecording,
    isRecording,
    audioLevel,
    updateConfig,
    getAudioDevices,
    availableDevices
  } = useAudioCapture()
  
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  
  // Save audio settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('audioDebugSettings', JSON.stringify(audioSettings));
    } catch (err) {
      console.error('Failed to save audio settings:', err);
    }
  }, [audioSettings])

  useEffect(() => {
    connect()
    
    // Add message handler
    const removeHandler = addMessageHandler(handleWebSocketMessage)
    
    // Load available audio devices
    getAudioDevices()
    
    return () => {
      removeHandler()
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (connectionState === 'open') {
      setIsConnected(true)
      // Initialize translation session
      sendMessage({
        type: 'init',
        sourceLang,
        targetLang,
        maxStreamDuration: maxStreamDuration * 1000 // Convert to milliseconds
      })
    } else {
      setIsConnected(false)
    }
  }, [connectionState, sourceLang, targetLang, maxStreamDuration])

  const handleStartListening = async () => {
    if (!isConnected) return
    
    try {
      // Enable streaming mode (second parameter = true, third parameter = custom audio settings, fourth = input mode)
      await startRecording((audioChunk, metadata) => {
        // Send audio chunk to backend in real-time with language information and metadata
        sendMessage({
          type: 'audio',
          audioData: audioChunk,
          sourceLang: sourceLang,
          targetLang: targetLang,
          streaming: true,
          // Include segment metadata for intelligent backend handling
          metadata: metadata || {}
        })
      }, true, audioSettings, audioInputMode, selectedDeviceId) // true = streaming mode, audioSettings = custom config, audioInputMode = mic/system, deviceId
      setIsListening(true)
      
      // Set active source label
      if (audioInputMode === 'system') {
        setActiveInputSource('🔊 System Audio')
      } else {
        const device = availableDevices.find(d => d.deviceId === selectedDeviceId)
        setActiveInputSource(device ? `🎤 ${device.label}` : '🎤 Microphone')
      }
    } catch (error) {
      console.error('Failed to start recording:', error)
      alert(`Failed to start ${audioInputMode === 'system' ? 'system audio' : 'microphone'} capture: ${error.message}`)
    }
  }
  
  const handleAudioSettingsChange = (newSettings) => {
    setAudioSettings(newSettings);
    // If listening, update config in real-time
    if (isListening) {
      updateConfig(newSettings);
      console.log('[TranslationInterface] Updated audio config during streaming:', newSettings);
    }
  }

  const handleStopListening = () => {
    // Pass the audio chunk callback to flush remaining audio
    stopRecording((audioChunk, metadata) => {
      if (audioChunk) {
        sendMessage({
          type: 'audio',
          audioData: audioChunk,
          sourceLang: sourceLang,
          targetLang: targetLang,
          streaming: true,
          metadata: metadata || {}
        })
      }
    })
    
    // Signal audio end to backend
    sendMessage({
      type: 'audio_end'
    })
    
    setIsListening(false)
    setActiveInputSource(null)
  }

  const handleLanguageChange = (type, language) => {
    if (type === 'source') {
      setSourceLang(language)
    } else {
      setTargetLang(language)
    }
    
    // Reinitialize session with new languages
    if (isConnected) {
      sendMessage({
        type: 'init',
        sourceLang: type === 'source' ? language : sourceLang,
        targetLang: type === 'target' ? language : targetLang,
        maxStreamDuration: maxStreamDuration * 1000 // Convert to milliseconds
      })
    }
  }

  const handleMaxStreamDurationChange = (duration) => {
    setMaxStreamDuration(duration)
    
    // Update backend with new duration
    if (isConnected) {
      sendMessage({
        type: 'init',
        sourceLang,
        targetLang,
        maxStreamDuration: duration * 1000 // Convert to milliseconds
      })
    }
  }

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'session_ready':
        console.log('Translation session ready')
        break
      case 'translation':
        setTranslations(prev => [...prev, {
          id: Date.now(),
          original: message.originalText,
          translated: message.translatedText,
          timestamp: message.timestamp
        }])
        setLatency(Date.now() - message.timestamp)
        break
      case 'error':
        console.error('Translation error:', message.message)
        // Show quota errors prominently
        if (message.code === 1011 || message.message.includes('Quota') || message.message.includes('quota')) {
          alert('⚠️ API Quota Exceeded!\n\n' + message.message + '\n\nPlease check your Gemini API limits and try again later.')
          // Stop listening if quota exceeded
          if (isListening) {
            handleStopListening()
          }
        }
        break
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <div className="container mx-auto px-4 py-8">
        {onBackToHome && (
          <button
            onClick={onBackToHome}
            className="mb-4 px-4 py-2 text-gray-600 hover:text-gray-800 flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
        )}
        
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold text-gray-900">Voice Translation - Solo Mode</h2>
            <ConnectionStatus 
              isConnected={isConnected} 
              latency={latency}
            />
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Language Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <LanguageSelector
            label="Source Language"
            languages={LANGUAGES}
            selectedLanguage={sourceLang}
            onLanguageChange={(lang) => handleLanguageChange('source', lang)}
          />
          <LanguageSelector
            label="Target Language"
            languages={LANGUAGES}
            selectedLanguage={targetLang}
            onLanguageChange={(lang) => handleLanguageChange('target', lang)}
          />
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Settings</h3>
            <div className="space-y-4">
              {/* Audio Input Mode Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Audio Input Source
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableAudioModes.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setAudioInputMode(mode.value)}
                      disabled={isListening}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                        audioInputMode === mode.value
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                      } ${isListening ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span className="text-lg">{mode.icon}</span>
                      <span className="font-medium">{mode.label}</span>
                    </button>
                  ))}
                </div>
                
                {/* Microphone Device Selector */}
                {audioInputMode === 'microphone' && availableDevices.length > 0 && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      Select Microphone Device:
                    </label>
                    <select
                      value={selectedDeviceId || ''}
                      onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                      disabled={isListening}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Default Microphone</option>
                      {availableDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      💡 Choose your built-in mic, USB mic, audio interface, or any connected audio input device
                    </p>
                  </div>
                )}
                <div className="text-xs text-gray-600 mt-2 space-y-2">
                  {deviceType === 'mobile' || deviceType === 'tablet' ? (
                    <p>
                      📱 <strong>{deviceType === 'mobile' ? 'Mobile' : 'Tablet'} device detected:</strong> Only microphone input is available.
                      {deviceType === 'tablet' && ' System audio requires a desktop browser.'}
                    </p>
                  ) : (
                    <>
                      <p>
                        💻 <strong>Desktop detected:</strong> Choose between microphone or system audio (captures what's playing on your computer).
                      </p>
                      {audioInputMode === 'system' && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-2">
                          <p className="font-semibold text-blue-900 mb-1">🔊 System Audio Setup (READ CAREFULLY!):</p>
                          <ol className="list-decimal list-inside space-y-1 text-blue-800">
                            <li><strong>Open YouTube/Spotify/etc in a NEW TAB</strong> (not this app!) and start playing audio</li>
                            <li>Come back to this tab and click "Start Listening" - browser dialog will appear</li>
                            <li><strong>CRITICAL:</strong> Click the <strong>"Chrome Tab"</strong> or <strong>"Tab"</strong> option at the top (NOT "Window" or "Entire Screen")</li>
                            <li><strong>Select the OTHER tab</strong> that's playing audio (YouTube, Spotify, etc.) - <strong>NOT the localhost tab!</strong></li>
                            <li><strong>Check the "Share tab audio"</strong> checkbox at the bottom before clicking Share</li>
                            <li>Click "Share" - you should see the audio level meter moving with the audio from that other tab</li>
                          </ol>
                          <div className="mt-2 space-y-1">
                            <p className="text-red-600 font-semibold">⚠️ "Window" and "Screen" options do NOT capture audio - only "Tab" works!</p>
                            <p className="text-purple-600 font-semibold">💡 You're capturing audio FROM another tab TO translate it here!</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {isListening && (
                    <p className="text-amber-600 font-medium">
                      ⚠️ Stop listening to change audio input source
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={audioEnabled}
                    onChange={(e) => setAudioEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Enable audio output</span>
                </label>
              </div>
              
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
                  disabled={isListening}
                />
                
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1s (Fast)</span>
                  <span>10s (Slow)</span>
                </div>
                
                <p className="text-xs text-gray-600 mt-2">
                  Controls how frequently translations are sent. Lower values provide faster updates 
                  but may cut sentences. Higher values wait longer for complete sentences.
                  {isListening && (
                    <span className="block text-amber-600 mt-1">
                      ⚠️ Stop listening to change this setting
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

        {/* Microphone Controls */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={isListening ? handleStopListening : handleStartListening}
              disabled={!isConnected}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all transform hover:scale-105 ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                  : isConnected
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isListening ? (
                <MicOff className="w-8 h-8" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
            
            {isListening && (
              <div className="flex items-center space-x-3">
                {/* LIVE Badge */}
                <div className="flex items-center space-x-1 bg-red-500 text-white px-2 py-1 rounded font-bold text-xs">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  <span>LIVE</span>
                </div>
                {activeInputSource && (
                  <span className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                    {activeInputSource}
                  </span>
                )}
                <span className="text-sm text-gray-600">Streaming translation...</span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Audio:</span>
                  <div className="flex space-x-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-4 rounded transition-all ${
                          i < (audioLevel * 5) ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  {audioLevel === 0 && (
                    <span className="text-xs text-red-600 font-semibold ml-2">
                      ⚠️ No audio detected!
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Translation Display */}
        <TranslationDisplay 
          translations={translations}
          audioEnabled={audioEnabled}
          isListening={isListening}
        />
          </div>
        </div>
      </div>
    </div>
  )
}

export default TranslationInterface
