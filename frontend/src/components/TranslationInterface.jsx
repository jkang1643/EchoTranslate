import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Globe, Settings } from 'lucide-react'
import LanguageSelector from './LanguageSelector'
import TranslationDisplay from './TranslationDisplay'
import ConnectionStatus from './ConnectionStatus'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAudioCapture } from '../hooks/useAudioCapture'

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

function TranslationInterface() {
  const [isListening, setIsListening] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('es')
  const [translations, setTranslations] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [latency, setLatency] = useState(0)

  const { 
    connect, 
    disconnect, 
    sendMessage, 
    connectionState,
    addMessageHandler
  } = useWebSocket('ws://localhost:3001/translate')

  const {
    startRecording,
    stopRecording,
    isRecording,
    audioLevel
  } = useAudioCapture()

  useEffect(() => {
    connect()
    
    // Add message handler
    const removeHandler = addMessageHandler(handleWebSocketMessage)
    
    return () => {
      removeHandler()
      disconnect()
    }
  }, [])

  useEffect(() => {
    if (connectionState === 'open') {
      setIsConnected(true)
      // Initialize translation session
      sendMessage({
        type: 'init',
        sourceLang,
        targetLang
      })
    } else {
      setIsConnected(false)
    }
  }, [connectionState, sourceLang, targetLang])

  const handleStartListening = async () => {
    if (!isConnected) return
    
    try {
      // Enable streaming mode (second parameter = true)
      await startRecording((audioChunk) => {
        // Send audio chunk to backend in real-time with language information
        sendMessage({
          type: 'audio',
          audioData: audioChunk,
          sourceLang: sourceLang,
          targetLang: targetLang,
          streaming: true
        })
      }, true) // true = streaming mode
      setIsListening(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  const handleStopListening = () => {
    stopRecording()
    setIsListening(false)
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
        targetLang: type === 'target' ? language : targetLang
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
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold text-gray-900">Voice Translation</h2>
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
                <span className="text-sm text-gray-600">Streaming translation...</span>
                {audioLevel > 0 && (
                  <div className="flex space-x-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-1 h-4 rounded transition-all ${
                          i < (audioLevel * 5) ? 'bg-red-500' : 'bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                )}
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
  )
}

export default TranslationInterface
