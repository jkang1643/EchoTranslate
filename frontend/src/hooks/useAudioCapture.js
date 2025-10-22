import { useState, useRef, useCallback } from 'react'

export function useAudioCapture() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  
  const mediaRecorderRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const audioProcessorRef = useRef(null)
  const streamRef = useRef(null)

  const startRecording = useCallback(async (onAudioChunk, streaming = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      streamRef.current = stream

      // Set up audio context for PCM capture and level monitoring
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
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
        // STREAMING MODE: Capture PCM audio using AudioWorklet or ScriptProcessor
        // Try using ScriptProcessor (deprecated but widely supported)
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
        
        source.connect(processor)
        processor.connect(audioContextRef.current.destination)
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
  }, [])

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
    audioLevel
  }
}
