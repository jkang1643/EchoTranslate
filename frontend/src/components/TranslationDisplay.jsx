import React, { useRef, useEffect } from 'react'
import { Volume2, VolumeX, Copy, Download } from 'lucide-react'

function TranslationDisplay({ translations, audioEnabled, isListening }) {
  const displayRef = useRef(null)

  useEffect(() => {
    if (displayRef.current) {
      displayRef.current.scrollTop = displayRef.current.scrollHeight
    }
  }, [translations])

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const downloadTranscript = () => {
    const content = translations.map(t => 
      `Original: ${t.original}\nTranslated: ${t.translated}\n---`
    ).join('\n')
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `translation-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Live Translation</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={downloadTranscript}
            disabled={translations.length === 0}
            className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div 
        ref={displayRef}
        className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto space-y-3"
      >
        {translations.length === 0 && !isListening ? (
          <div className="text-center text-gray-500 py-8">
            <p>Start speaking to see translations here</p>
          </div>
        ) : (
          <>
            {translations.map((translation) => (
              <div key={translation.id} className="bg-white rounded-lg p-4 shadow-sm animate-fadeIn">
                <div className="space-y-3">
                  {translation.original && translation.original !== '[Audio/Text input]' && (
                    <div className="border-l-4 border-blue-500 pl-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                          Original
                        </span>
                        <button
                          onClick={() => copyToClipboard(translation.original)}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-gray-800">{translation.original}</p>
                    </div>
                  )}
                  
                  <div className="border-l-4 border-green-500 pl-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-green-600 uppercase tracking-wide">
                        Translated
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
                              // Play translated audio
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
                    <p className="text-gray-800">{translation.translated}</p>
                  </div>
                </div>
                
                <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                  <span>{new Date(translation.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            
            {/* Processing Indicator - shows when listening but waiting for next translation */}
            {isListening && (
              <div className="bg-blue-50 rounded-lg p-4 shadow-sm border border-blue-200 animate-pulse">
                <div className="flex items-center space-x-2 text-blue-600">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping"></div>
                  <span className="text-sm font-medium">Processing audio...</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default TranslationDisplay
