import { useState, useEffect } from 'react'

// Conversation type presets optimized for different use cases
const CONVERSATION_PRESETS = {
  preaching: {
    name: '🎤 Preaching / Sermon',
    settings: {
      maxQueueSize: 10,
      maxSegmentMs: 1500,
      minSegmentMs: 500,
      silenceTimeoutMs: 700,
      overlapMs: 150,
      workerIntervalMs: 100,
      silenceThreshold: 0.005,
      sampleRate: 16000
    }
  },
  conversation: {
    name: '💬 Conversation',
    settings: {
      maxQueueSize: 15,
      maxSegmentMs: 2000,
      minSegmentMs: 800,
      silenceTimeoutMs: 1000,
      overlapMs: 200,
      workerIntervalMs: 150,
      silenceThreshold: 0.010,
      sampleRate: 16000
    }
  },
  speech: {
    name: '📢 Formal Speech',
    settings: {
      maxQueueSize: 12,
      maxSegmentMs: 2500,
      minSegmentMs: 1000,
      silenceTimeoutMs: 1200,
      overlapMs: 200,
      workerIntervalMs: 150,
      silenceThreshold: 0.008,
      sampleRate: 16000
    }
  },
  debate: {
    name: '⚡ Debate / Fast Talk',
    settings: {
      maxQueueSize: 20,
      maxSegmentMs: 1200,
      minSegmentMs: 400,
      silenceTimeoutMs: 500,
      overlapMs: 100,
      workerIntervalMs: 100,
      silenceThreshold: 0.012,
      sampleRate: 16000
    }
  }
}

/**
 * AudioDebugSettings Component
 * Provides a collapsible panel to tweak all audio capture/buffering parameters in real-time
 */
export default function AudioDebugSettings({ settings, onSettingsChange }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [localSettings, setLocalSettings] = useState(settings)
  const [selectedPreset, setSelectedPreset] = useState('preaching')

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])
  
  // Check if debug mode is enabled via ENV variable
  const isDebugMode = import.meta.env.VITE_DEBUG_MODE === 'true'

  const handleChange = (key, value) => {
    const newSettings = { ...localSettings, [key]: value }
    setLocalSettings(newSettings)
    onSettingsChange(newSettings)
  }
  
  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey)
    const presetSettings = CONVERSATION_PRESETS[presetKey].settings
    setLocalSettings(presetSettings)
    onSettingsChange(presetSettings)
  }

  const resetToDefaults = () => {
    // Reset to preaching preset as default
    handlePresetChange('preaching')
  }

  const exportSettings = () => {
    const json = JSON.stringify(localSettings, null, 2)
    navigator.clipboard.writeText(json)
    alert('Settings copied to clipboard!')
  }

  return (
    <div className="space-y-3">
      {/* Conversation Type Preset Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Conversation Type
        </label>
        
        <select
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="w-full px-3 py-2 bg-white text-gray-900 rounded border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {Object.entries(CONVERSATION_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.name}
            </option>
          ))}
        </select>
        
        <p className="text-xs text-gray-600">
          Optimized settings for different speaking styles. Select the one that matches your use case.
        </p>
      </div>

      {/* Debug Mode - Advanced Controls */}
      {isDebugMode && (
        <>
          <div className="border-t border-gray-300 pt-3">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 font-medium"
            >
              <span className="text-lg">🔧</span>
              <span>{showAdvanced ? '▼' : '▶'}</span>
              <span>Advanced Debug Controls</span>
            </button>
          </div>

          {showAdvanced && (
            <>
              {/* Action Buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={resetToDefaults}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  Reset to Preaching
                </button>
                <button
                  onClick={exportSettings}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                >
                  Copy Settings
                </button>
              </div>

              {/* Queue Settings */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Queue Settings
                </h3>
                
                <ParameterControl
                  label="Max Queue Size"
                  value={localSettings.maxQueueSize}
                  onChange={(v) => handleChange('maxQueueSize', v)}
                  min={5}
                  max={100}
                  step={5}
                  unit="chunks"
                  description="Maximum chunks in capture queue (~256ms each)"
                />
              </div>

              {/* Timing Settings */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Timing Settings
                </h3>
                
                <ParameterControl
                  label="Max Segment Duration"
                  value={localSettings.maxSegmentMs}
                  onChange={(v) => handleChange('maxSegmentMs', v)}
                  min={1000}
                  max={10000}
                  step={500}
                  unit="ms"
                  description="Maximum duration before forcing batch flush"
                />
                
                <ParameterControl
                  label="Min Segment Duration"
                  value={localSettings.minSegmentMs}
                  onChange={(v) => handleChange('minSegmentMs', v)}
                  min={500}
                  max={3000}
                  step={100}
                  unit="ms"
                  description="Minimum duration before allowing flush"
                />
                
                <ParameterControl
                  label="Silence Timeout"
                  value={localSettings.silenceTimeoutMs}
                  onChange={(v) => handleChange('silenceTimeoutMs', v)}
                  min={500}
                  max={5000}
                  step={100}
                  unit="ms"
                  description="Silence duration that triggers flush"
                />
                
                <ParameterControl
                  label="Overlap Duration"
                  value={localSettings.overlapMs}
                  onChange={(v) => handleChange('overlapMs', v)}
                  min={0}
                  max={1000}
                  step={50}
                  unit="ms"
                  description="Audio overlap between segments to prevent cutting"
                />
                
                <ParameterControl
                  label="Worker Interval"
                  value={localSettings.workerIntervalMs}
                  onChange={(v) => handleChange('workerIntervalMs', v)}
                  min={50}
                  max={1000}
                  step={50}
                  unit="ms"
                  description="How often worker drains queue"
                />
              </div>

              {/* VAD Settings */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Voice Activity Detection
                </h3>
                
                <ParameterControl
                  label="Silence Threshold"
                  value={localSettings.silenceThreshold}
                  onChange={(v) => handleChange('silenceThreshold', v)}
                  min={0.001}
                  max={0.1}
                  step={0.001}
                  unit="RMS"
                  precision={3}
                  description="RMS energy threshold for silence detection"
                />
              </div>

              {/* Audio Format (read-only) */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Audio Format (Read-Only)
                </h3>
                
                <div className="bg-gray-100 rounded p-3 text-sm border border-gray-300">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Sample Rate:</span>
                    <span className="text-gray-900 font-mono">{localSettings.sampleRate} Hz</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Format:</span>
                    <span className="text-gray-900 font-mono">16-bit PCM Mono</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Chunk Size:</span>
                    <span className="text-gray-900 font-mono">4096 samples (~256ms)</span>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="space-y-2 bg-blue-50 rounded p-3 border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide">
                  Calculated Metrics
                </h3>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Queue capacity: ~{((localSettings.maxQueueSize * 256) / 1000).toFixed(1)}s of audio</div>
                  <div>Flush frequency: ~{(localSettings.maxSegmentMs / 1000).toFixed(1)}s intervals</div>
                  <div>Worker checks: {(1000 / localSettings.workerIntervalMs).toFixed(0)} times/sec</div>
                  <div>Overlap samples: {Math.floor((localSettings.sampleRate * localSettings.overlapMs) / 1000)}</div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Individual Parameter Control Component
 */
function ParameterControl({ label, value, onChange, min, max, step, unit, description, precision = 0 }) {
  const [inputValue, setInputValue] = useState(value)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleSliderChange = (e) => {
    const newValue = parseFloat(e.target.value)
    setInputValue(newValue)
    onChange(newValue)
  }

  const handleInputChange = (e) => {
    const newValue = e.target.value
    setInputValue(newValue)
  }

  const handleInputBlur = () => {
    let newValue = parseFloat(inputValue)
    if (isNaN(newValue)) {
      setInputValue(value)
      return
    }
    newValue = Math.max(min, Math.min(max, newValue))
    setInputValue(newValue)
    onChange(newValue)
  }

  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-700">{label}</label>
        <div className="flex items-center space-x-2">
          <input
            type="number"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            step={step}
            min={min}
            max={max}
            className="w-20 px-2 py-1 bg-white text-gray-900 text-sm rounded border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-500 w-12">{unit}</span>
        </div>
      </div>
      
      <div className="relative">
        <input
          type="range"
          value={value}
          onChange={handleSliderChange}
          min={min}
          max={max}
          step={step}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`
          }}
        />
      </div>
      
      {description && (
        <p className="text-xs text-gray-600">{description}</p>
      )}
    </div>
  )
}

