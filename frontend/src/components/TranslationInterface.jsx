import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Mic, MicOff, Volume2, VolumeX, Globe, Settings, ArrowLeft } from 'lucide-react'
import { LanguageSelector } from './LanguageSelector'
import TranslationDisplay from './TranslationDisplay'
import { ConnectionStatus } from './ConnectionStatus'
import { Header } from './Header'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { SentenceSegmenter } from '../utils/sentenceSegmenter'

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
  
  // CRITICAL: Separate states for live streaming vs history
  const [livePartial, setLivePartial] = useState('') // 🔴 LIVE text appearing word-by-word
  const [livePartialOriginal, setLivePartialOriginal] = useState('') // 🔴 LIVE original (for translation mode)
  const [finalTranslations, setFinalTranslations] = useState([]) // 📝 Completed translations
  
  const [showSettings, setShowSettings] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [latency, setLatency] = useState(0)
  
  // Throttle mechanism for smooth streaming
  const lastUpdateTimeRef = useRef(0)
  const pendingTextRef = useRef(null)
  const throttleTimerRef = useRef(null)
  
  // Sentence segmenter for smart text management
  const segmenterRef = useRef(null)
  const sendMessageRef = useRef(null)
  
  if (!segmenterRef.current) {
    segmenterRef.current = new SentenceSegmenter({
      maxSentences: 3,      // Keep max 3 sentences in live view
      maxChars: 500,        // Force flush after 500 chars
      maxTimeMs: 15000,     // Force flush after 15 seconds
      onFlush: (flushedSentences) => {
        // Move flushed sentences to history with forced paint
        const joinedText = flushedSentences.join(' ').trim()
        if (joinedText) {
          // Schedule flush for next tick to allow browser paint between flushes
          // This prevents browser from batching all visual updates until VAD pause
          setTimeout(() => {
            flushSync(() => {
              setFinalTranslations(prev => [...prev, {
                id: Date.now() + Math.random(),
                original: '',
                translated: joinedText,
                timestamp: Date.now(),
                sequenceId: -1,
                isSegmented: true  // Flag to indicate this was auto-segmented
              }])
            })
            console.log(`[TranslationInterface] ✅ Flushed to history with paint: "${joinedText.substring(0, 40)}..."`)
          }, 0)
          
          // Note: No backend force-commit needed
          // OpenAI partials are cumulative per turn - we can't control mid-turn breaks
          // The stripping logic above handles display by hiding already-shown content
        }
      }
    })
  }

  // Memoize WebSocket URL calculation to prevent re-computation on every render
  const finalWebSocketUrl = useMemo(() => {
    const getWebSocketUrl = () => {
      const hostname = window.location.hostname;
      
      // Validate IP address format
      const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      
      if (hostname !== 'localhost' && !ipv4Pattern.test(hostname)) {
        return 'ws://localhost:3001/translate';
      }
      
      return `ws://${hostname}:3001/translate`;
    };

    const websocketUrl = import.meta.env.VITE_WS_URL || getWebSocketUrl();
    const finalUrl = websocketUrl.endsWith('/translate') ? websocketUrl : websocketUrl + '/translate';
    console.log('[TranslationInterface] 🔌 WebSocket URL:', finalUrl);
    return finalUrl;
  }, []); // Empty deps - only calculate once

  const { 
    connect, 
    disconnect, 
    sendMessage, 
    connectionState,
    addMessageHandler
  } = useWebSocket(finalWebSocketUrl)
  
  // Update sendMessage ref for segmenter callback
  sendMessageRef.current = sendMessage

  const {
    startRecording,
    stopRecording,
    isRecording,
    audioLevel,
    availableDevices,
    selectedDeviceId,
    setSelectedDeviceId
  } = useAudioCapture()

  // Define message handler with useCallback to prevent re-creation
  const handleWebSocketMessage = useCallback((message) => {
    console.log('[TranslationInterface] 🔔 MESSAGE HANDLER CALLED:', message.type, message.isPartial ? '(PARTIAL)' : '(FINAL)')
    
    switch (message.type) {
      case 'session_ready':
        console.log('[TranslationInterface] ✅ Translation session ready')
        break
      case 'translation':
        if (message.isPartial) {
          // 🔴 LIVE PARTIAL: Run through sentence segmenter + throttle for smooth streaming
          const isTranslationMode = sourceLang !== targetLang
          const hasTranslation = message.hasTranslation
          
          // For translation mode, show both original and translated
          if (isTranslationMode) {
            // Always update original immediately (transcription is instant)
            const originalText = message.originalText
            if (originalText) {
              setLivePartialOriginal(originalText)
            }
            
            // Update translation (might be delayed due to throttling)
            if (hasTranslation && message.translatedText) {
              const translatedText = message.translatedText
              const now = Date.now()
              
              pendingTextRef.current = translatedText
              const timeSinceLastUpdate = now - lastUpdateTimeRef.current
              
              if (timeSinceLastUpdate >= 50) {
                lastUpdateTimeRef.current = now
                flushSync(() => {
                  setLivePartial(translatedText)
                })
              } else {
                if (throttleTimerRef.current) {
                  clearTimeout(throttleTimerRef.current)
                }
                
                throttleTimerRef.current = setTimeout(() => {
                  const latestText = pendingTextRef.current
                  if (latestText !== null) {
                    lastUpdateTimeRef.current = Date.now()
                    flushSync(() => {
                      setLivePartial(latestText)
                    })
                  }
                }, 50)
              }
            }
          } else {
            // Transcription-only mode - just show the text
            const rawText = message.originalText || message.translatedText
            const now = Date.now()
            
            // Process through segmenter (auto-flushes complete sentences to history)
            const { liveText } = segmenterRef.current.processPartial(rawText)
            
            // Store the segmented text
            pendingTextRef.current = liveText
            
            // THROTTLE: Update max 20 times per second (50ms intervals)
            const timeSinceLastUpdate = now - lastUpdateTimeRef.current
            
            if (timeSinceLastUpdate >= 50) {
              // Immediate update with forced sync render
              lastUpdateTimeRef.current = now
              flushSync(() => {
                setLivePartial(liveText)
              })
              console.log(`[TranslationInterface] ⚡ IMMEDIATE: "${liveText.substring(0, 30)}..." [${liveText.length}chars]`)
            } else {
              // Schedule delayed update
              if (throttleTimerRef.current) {
                clearTimeout(throttleTimerRef.current)
              }
              
              throttleTimerRef.current = setTimeout(() => {
                const latestText = pendingTextRef.current
                if (latestText !== null) {
                  lastUpdateTimeRef.current = Date.now()
                  flushSync(() => {
                    setLivePartial(latestText)
                  })
                  console.log(`[TranslationInterface] ⏱️ THROTTLED: "${latestText.substring(0, 30)}..." [${latestText.length}chars]`)
                }
              }, 50)
            }
          }
        } else {
          // 📝 FINAL: Process through segmenter to flush ONLY NEW text (deduplicated)
          const finalText = message.translatedText
          console.log(`[TranslationInterface] 📝 FINAL: "${finalText.substring(0, 50)}..." - Processing through segmenter`)
          
          // Segmenter deduplicates and returns only new sentences
          const { flushedSentences } = segmenterRef.current.processFinal(finalText)
          
          // Add deduplicated sentences to history
          if (flushedSentences.length > 0) {
            const joinedText = flushedSentences.join(' ').trim()
            setFinalTranslations(prev => [...prev, {
              id: Date.now(),
              original: message.originalText || '',
              translated: joinedText,
              timestamp: message.timestamp || Date.now(),
              sequenceId: message.sequenceId
            }])
          }
          
          // Clear live partial for next segment
          setLivePartial('')
          setLivePartialOriginal('')
          setLatency(Date.now() - (message.timestamp || Date.now()))
        }
        break
      case 'warning':
        console.warn('[TranslationInterface] ⚠️ Warning:', message.message)
        // Could show a toast notification here
        break
        
      case 'error':
        console.error('[TranslationInterface] ❌ Translation error:', message.message)
        // Show quota errors prominently
        if (message.code === 1011 || message.message.includes('Quota') || message.message.includes('quota')) {
          alert('⚠️ API Quota Exceeded!\n\n' + message.message + '\n\nPlease check your API limits and try again later.')
        }
        break
      default:
        console.log('[TranslationInterface] ⚠️ Unknown message type:', message.type)
    }
  }, []) // No dependencies - handler is stable
  
  useEffect(() => {
    console.log('[TranslationInterface] 🚀 Initializing WebSocket connection')
    connect()
    
    // Add message handler
    const removeHandler = addMessageHandler(handleWebSocketMessage)
    
    return () => {
      console.log('[TranslationInterface] 🔌 Cleaning up WebSocket')
      removeHandler()
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleWebSocketMessage])

  useEffect(() => {
    if (connectionState === 'open') {
      setIsConnected(true)
      console.log('[TranslationInterface] 📡 WebSocket OPEN - Initializing session')
      // Initialize translation session
      sendMessage({
        type: 'init',
        sourceLang,
        targetLang
      })
    } else {
      setIsConnected(false)
      if (connectionState !== 'connecting') {
        console.log('[TranslationInterface] ⚠️ WebSocket state:', connectionState)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState, sourceLang, targetLang]) // Remove sendMessage from deps to prevent re-render loop

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
    
    // Reset segmenter deduplication memory after significant stop
    // This prevents old text from interfering with new sessions
    setTimeout(() => {
      if (segmenterRef.current) {
        console.log('[TranslationInterface] 🔄 Resetting segmenter deduplication memory')
        segmenterRef.current.reset()
      }
    }, 2000) // Wait 2 seconds after stop before resetting
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

  // handleWebSocketMessage is now defined above with useCallback

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
                <h2 className="text-2xl font-bold text-gray-900">
                  {sourceLang === targetLang ? 'Voice Transcription' : 'Voice Translation'} - Solo Mode
                </h2>
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
            
            {/* Microphone Selector */}
            {availableDevices.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🎤 Microphone Device
                </label>
                <select
                  value={selectedDeviceId || ''}
                  onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isListening}
                >
                  <option value="">Auto-select (Recommended)</option>
                  {availableDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.substring(0, 8)}`}
                    </option>
                  ))}
                </select>
                {isListening && (
                  <p className="text-xs text-amber-600 mt-1">
                    Stop listening to change microphone
                  </p>
                )}
              </div>
            )}
            
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
          finalTranslations={finalTranslations}
          livePartial={livePartial}
          livePartialOriginal={livePartialOriginal}
          audioEnabled={audioEnabled}
          isListening={isListening}
          sourceLang={sourceLang}
          targetLang={targetLang}
        />
          </div>
        </div>
      </div>
    </div>
  )
}

export default TranslationInterface
