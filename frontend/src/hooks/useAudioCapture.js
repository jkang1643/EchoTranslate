import { useState, useRef, useCallback } from 'react'

export function useAudioCapture() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [availableDevices, setAvailableDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [currentDeviceLabel, setCurrentDeviceLabel] = useState('')
  const [deviceWarning, setDeviceWarning] = useState('')
  
  const mediaRecorderRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const audioProcessorRef = useRef(null)
  const streamRef = useRef(null)

  const startRecording = useCallback(async (onAudioChunk, streaming = false) => {
    try {
      // First, enumerate devices to see what's available
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      
      setAvailableDevices(audioInputs)
      
      console.log('🎤 Available audio input devices:')
      audioInputs.forEach((device, index) => {
        console.log(`  ${index}: ${device.label || 'Unknown Device'} (${device.deviceId})`)
      })
      
      // Use selected device, or find the actual microphone (not system audio or loopback)
      let deviceId = selectedDeviceId
      
      if (!deviceId) {
        // Auto-select: Prioritize devices with "microphone" or "mic" in the label
        // Avoid "Stereo Mix", "Wave Out", "System Audio", etc.
        const micDevice = audioInputs.find(device => {
          const label = device.label.toLowerCase()
          return (label.includes('microphone') || label.includes('mic')) &&
                 !label.includes('stereo mix') &&
                 !label.includes('wave out') &&
                 !label.includes('system audio') &&
                 !label.includes('loopback')
        }) || audioInputs[0]
        
        deviceId = micDevice?.deviceId
        console.log(`🎤 Auto-selected device: ${micDevice?.label || 'Default'}`)
      } else {
        const device = audioInputs.find(d => d.deviceId === deviceId)
        console.log(`🎤 Using manually selected device: ${device?.label || 'Unknown'}`)
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: 24000,  // Higher quality for better transcription
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,  // DISABLED - was cutting out speech
          autoGainControl: false,   // DISABLED - causing volume issues
          advanced: [
            { echoCancellation: { ideal: true } }
          ]
        } 
      })
      streamRef.current = stream
      
      // Log the actual track settings
      const audioTrack = stream.getAudioTracks()[0]
      console.log('🎤 Audio track settings:', audioTrack.getSettings())
      console.log('🎤 Audio track label:', audioTrack.label)

      // Set up audio context for PCM capture and level monitoring
      // Use 24kHz for better quality transcription
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      })
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      source.connect(analyserRef.current)

      // Start level monitoring
      const monitorLevel = () => {
        if (!analyserRef.current) return
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
        setAudioLevel(average / 255)
        
        animationFrameRef.current = requestAnimationFrame(monitorLevel)
      }
      monitorLevel()

      if (streaming) {
        // STREAMING MODE: Use AudioWorklet (runs on separate thread) for smooth performance
        try {
          // Load the AudioWorklet module
          await audioContextRef.current.audioWorklet.addModule('/audio-stream-processor.js')
          
          // Create AudioWorklet node
          const workletNode = new AudioWorkletNode(
            audioContextRef.current,
            'stream-processor'
          )
          audioProcessorRef.current = workletNode
          
          // Listen for processed audio from worklet (runs on separate thread!)
          workletNode.port.onmessage = (event) => {
            if (event.data.type === 'audio') {
              // Convert Int16Array to base64
              const pcmData = event.data.data
              const base64 = btoa(
                String.fromCharCode.apply(null, new Uint8Array(pcmData.buffer))
              )
              onAudioChunk(base64)
            }
          }
          
          // Connect audio graph
          source.connect(workletNode)
          
          // Create silent output to satisfy browser
          const silentGain = audioContextRef.current.createGain()
          silentGain.gain.value = 0
          workletNode.connect(silentGain)
          silentGain.connect(audioContextRef.current.destination)
          
          console.log('🎤 ✅ AudioWorklet initialized (audio processing OFF main thread)')
          
        } catch (error) {
          console.error('❌ AudioWorklet failed, falling back to ScriptProcessor:', error)
          
          // FALLBACK: Use deprecated ScriptProcessor if AudioWorklet not supported
          const bufferSize = 4096
          const processor = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1)
          audioProcessorRef.current = processor
          
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0)
            
            // Convert Float32Array to Int16Array (PCM format)
            const pcmData = new Int16Array(inputData.length)
            for (let i = 0; i < inputData.length; i++) {
              // Convert from [-1, 1] to [-32768, 32767]
              const s = Math.max(-1, Math.min(1, inputData[i]))
              pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
            }
            
            // Convert to base64
            const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcmData.buffer)))
            onAudioChunk(base64)
          }
          
          // Create a silent gain node to satisfy browser requirements
          const silentGain = audioContextRef.current.createGain()
          silentGain.gain.value = 0 // Mute completely
          
          source.connect(processor)
          processor.connect(silentGain)
          silentGain.connect(audioContextRef.current.destination)
          
          console.warn('⚠️ Using deprecated ScriptProcessor (may block UI rendering)')
        }
      } else {
        // NON-STREAMING MODE: Use MediaRecorder for WebM (will need conversion on backend)
        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        })
        
        const audioChunks = []
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data)
          }
        }

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
          
          // Convert to base64 for transmission
          const reader = new FileReader()
          reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1]
            onAudioChunk(base64Audio)
          }
          reader.readAsDataURL(audioBlob)
        }

        mediaRecorderRef.current.start(100)
      }
      
      setIsRecording(true)

    } catch (error) {
      console.error('Failed to start recording:', error)
      throw error
    }
  }, [selectedDeviceId])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }

    // Disconnect audio processor
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect()
      audioProcessorRef.current = null
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // Stop level monitoring
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    setAudioLevel(0)

    // Clean up audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    setIsRecording(false)
  }, [isRecording])

  return {
    startRecording,
    stopRecording,
    isRecording,
    audioLevel,
    availableDevices,
    selectedDeviceId,
    setSelectedDeviceId
  }
}
