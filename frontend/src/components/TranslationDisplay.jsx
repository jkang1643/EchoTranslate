import React, { useEffect, useRef } from 'react'
import { Volume2, Copy, Download } from 'lucide-react'

function TranslationDisplay({ 
  finalTranslations, 
  livePartial, 
  audioEnabled, 
  isListening, 
  sourceLang, 
  targetLang
}) {
  const isTranscriptionMode = sourceLang === targetLang
  const transcriptBoxRef = useRef(null)
  const translationBoxRef = useRef(null)
  
  // DEBUG: Log when component receives live partial
  useEffect(() => {
    if (livePartial) {
      console.log('[TranslationDisplay] 🔴 LIVE PARTIAL RENDER:', livePartial.substring(0, 50))
    }
  }, [livePartial])
  
  // Auto-scroll to bottom when live partial updates
  useEffect(() => {
    if (transcriptBoxRef.current && livePartial) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight
    }
  }, [livePartial])

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const downloadTranscript = () => {
    const content = finalTranslations.map(t => 
      `${isTranscriptionMode ? 'Transcription' : 'Original'}: ${t.original || t.translated}\n${isTranscriptionMode ? '' : `Translated: ${t.translated}\n`}---`
    ).join('\n')
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${isTranscriptionMode ? 'transcription' : 'translation'}-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {isTranscriptionMode ? 'Live Transcription' : 'Live Translation'}
        </h3>
        <button
          onClick={downloadTranscript}
          disabled={finalTranslations.length === 0}
          className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span>Download</span>
        </button>
      </div>

      {/* LIVE TRANSCRIPTION AREA - FIXED POSITION, INLINE UPDATES */}
      <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {isListening && (
              <div className="flex space-x-1">
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce"></div>
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce" style={{animationDelay: '0.15s'}}></div>
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce" style={{animationDelay: '0.3s'}}></div>
              </div>
            )}
            <span className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              {isListening ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                  </span>
                  LIVE
                </>
              ) : (
                'READY'
              )}
            </span>
          </div>
          {livePartial && (
            <button
              onClick={() => copyToClipboard(livePartial)}
              className="p-1.5 text-white/80 hover:text-white transition-colors"
              title="Copy live text"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* TRANSCRIPTION BOX - Updates inline, no appending */}
          <div 
            ref={transcriptBoxRef}
            className="bg-white/95 backdrop-blur rounded-xl p-6 min-h-[140px] max-h-[400px] overflow-y-auto transition-none scroll-smooth"
          >
            {livePartial ? (
              <p className="text-gray-900 font-semibold text-3xl leading-relaxed tracking-wide break-words">
                {livePartial}
                {isListening && (
                  <span className="inline-block w-1 h-8 ml-2 bg-blue-600 animate-pulse"></span>
                )}
                {/* DEBUG: Force visible change with timestamp */}
                <span className="text-xs text-red-600 font-mono ml-2">
                  [{livePartial.length}chars]
                </span>
              </p>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[140px]">
                <p className="text-gray-400 text-xl">
                  {/* Always show ready state - partials will appear immediately */}
                  {isListening ? 'Ready • Start speaking...' : 'Click "Listen" to start'}
                </p>
              </div>
            )}
          </div>
        
        <div className="mt-3 text-xs text-white/80 font-medium">
          {livePartial ? (
            <>🔴 LIVE • Words streaming in real-time</>
          ) : isListening ? (
            <>Ready • Start speaking to see text appear</>
          ) : (
            <>Start listening to see live transcription</>
          )}
        </div>
      </div>

      {/* Note: Translation mode not yet implemented with new pattern */}

      {/* HISTORY - Completed paragraphs scroll below */}
      {finalTranslations.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-5 border-2 border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <span className="text-blue-600">📝</span>
              History
              <span className="text-xs text-gray-500 font-normal">
                ({finalTranslations.length} {finalTranslations.length === 1 ? 'segment' : 'segments'})
              </span>
            </h4>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {finalTranslations.slice().reverse().map((translation, index) => (
              <div 
                key={translation.id} 
                className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-all border border-gray-200 animate-fadeIn"
              >
                {!isTranscriptionMode && translation.original && (
                  <div className="mb-3 pb-3 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-blue-600 uppercase">Original</span>
                      <button
                        onClick={() => copyToClipboard(translation.original)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-gray-700 text-base leading-relaxed">{translation.original}</p>
                  </div>
                )}
                
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-semibold uppercase ${isTranscriptionMode ? 'text-blue-600' : 'text-green-600'}`}>
                      {isTranscriptionMode ? 'Transcription' : 'Translation'}
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => copyToClipboard(translation.translated)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {audioEnabled && (
                        <button
                          onClick={() => {
                            const utterance = new SpeechSynthesisUtterance(translation.translated)
                            speechSynthesis.speak(utterance)
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-900 text-base font-medium leading-relaxed">{translation.translated}</p>
                </div>
                
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
                  <span>{new Date(translation.timestamp).toLocaleTimeString()}</span>
                  <span className="text-gray-300">#{finalTranslations.length - index}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {finalTranslations.length === 0 && !livePartial && !isListening && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-12 text-center border-2 border-dashed border-blue-300">
          <div className="space-y-3">
            <div className="text-5xl">🎤</div>
            <p className="text-gray-600 text-lg font-medium">Ready to Start</p>
            <p className="text-gray-500 text-sm">
              Click "Listen" and start speaking to see live {isTranscriptionMode ? 'transcription' : 'translation'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default TranslationDisplay
