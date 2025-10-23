import { useState, useRef, useCallback } from 'react'

export function useAudioCapture() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [availableDevices, setAvailableDevices] = useState([])
  
  const mediaRecorderRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const audioProcessorRef = useRef(null)
  const streamRef = useRef(null)

  // ====================================================================
  // DOUBLE-BUFFER ARCHITECTURE: Separate Capture Queue + Worker Thread
  // ====================================================================
  
  // CAPTURE THREAD: Continuously writes to this queue (never awaits)
  const audioQueueRef = useRef([])  // Queue of PCM chunks (Int16Array)
  
  // WORKER THREAD: Drains queue and batches for sending
  const workerTimerRef = useRef(null)
  const currentBatchRef = useRef([])
  const batchStartTimeRef = useRef(0)
  const lastSpeechTimeRef = useRef(0)
  const averageEnergyRef = useRef(0)
  const chunkCountRef = useRef(0)
  
  // Active sends tracking (for overlapping sends)
  const activeSendsRef = useRef(0)
  const sendCountRef = useRef(0)
  
  // Configurable parameters (can be overridden via settings)
  // Default: Optimized for continuous speech (sermons, presentations, etc.)
  const configRef = useRef({
    maxQueueSize: 15,
    maxSegmentMs: 6000, // 6 seconds - longer segments for better context
    minSegmentMs: 1000, // 1 second minimum
    silenceTimeoutMs: 2000, // 2 seconds - allows natural pauses
    silenceThreshold: 0.005,
    overlapMs: 300, // 300ms overlap for better continuity
    workerIntervalMs: 100,
    sampleRate: 16000
  })

  // Calculate RMS (Root Mean Square) energy for VAD
  const calculateRMS = (samples) => {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / 32768 // Normalize to [-1, 1]
      sum += normalized * normalized
    }
    return Math.sqrt(sum / samples.length)
  }

  // ====================================================================
  // CAPTURE THREAD: Non-blocking audio chunk processor
  // This NEVER awaits or blocks - just pushes to queue
  // ====================================================================
  const processAudioChunk = (pcmChunk) => {
    const config = configRef.current
    const queueSize = audioQueueRef.current.length
    
    if (queueSize < config.maxQueueSize) {
      audioQueueRef.current.push(pcmChunk)
      chunkCountRef.current++
      
      // Log every 10 chunks for monitoring
      if (chunkCountRef.current % 10 === 0) {
        const queueDuration = audioQueueRef.current.reduce((sum, chunk) => sum + chunk.length, 0) / config.sampleRate * 1000
        console.log(`[📦 Capture] Queue: ${queueSize} chunks, ${queueDuration.toFixed(0)}ms, Total captured: ${chunkCountRef.current}`)
      }
    } else {
      console.warn(`[⚠️  Capture] Queue full (${config.maxQueueSize}) - dropping oldest chunk`)
      audioQueueRef.current.shift() // Drop oldest
      audioQueueRef.current.push(pcmChunk)
    }
  }

  // ====================================================================
  // WORKER THREAD: Async batch processor
  // Drains queue, batches segments, sends to Gemini (fire-and-forget)
  // ====================================================================
  const translationWorker = (onAudioChunk) => {
    const config = configRef.current
    const now = performance.now()
    const queueSize = audioQueueRef.current.length
    
    // Drain all chunks from queue into current batch
    let drainedChunks = 0
    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()
      currentBatchRef.current.push(...chunk)
      drainedChunks++
    }
    
    if (drainedChunks > 0) {
      console.log(`[⚙️  Worker] Drained ${drainedChunks} chunks from queue → batch size: ${currentBatchRef.current.length} samples`)
    }
    
    // Queue pressure detection: Force flush if queue is getting too full
    if (audioQueueRef.current.length >= config.maxQueueSize * 0.7) {
      console.warn(`[⚠️  Worker] Queue high (${audioQueueRef.current.length}/${config.maxQueueSize}) - forcing flush`)
      if (currentBatchRef.current.length > 0) {
        flushBatch(onAudioChunk, 'queue_pressure', true)
        return // Exit early after forced flush
      }
    }
    
    // Check if we should flush the current batch
    const batchDuration = (currentBatchRef.current.length / config.sampleRate) * 1000
    const timeSinceBatchStart = now - batchStartTimeRef.current
    const timeSinceLastSpeech = now - lastSpeechTimeRef.current
    
    let flushReason = null
    
    // ACTIVE ROLLING FLUSH: Time-based, not duration-based
    // PRIMARY: Rolling flush at fixed interval (regardless of content)
    if (timeSinceBatchStart >= config.maxSegmentMs) {
      flushReason = `rolling_flush_${(config.maxSegmentMs / 1000).toFixed(1)}s`
    }
    // SAFETY: Overflow protection (should rarely trigger with rolling flush)
    else if (batchDuration >= (config.maxSegmentMs * 1.5)) {
      flushReason = 'overflow_protection'
    }
    // OPTIONAL: Early flush on silence (for natural pauses)
    else if (timeSinceLastSpeech > config.silenceTimeoutMs && batchDuration >= config.minSegmentMs) {
      flushReason = `silence_${(config.silenceTimeoutMs / 1000).toFixed(1)}s`
    }
    
    if (flushReason) {
      flushBatch(onAudioChunk, flushReason)
    }
  }

  // ====================================================================
  // BATCH FLUSHER: Fire-and-forget async send
  // Allows overlapping sends - never blocks capture or worker
  // ====================================================================
  const flushBatch = (onAudioChunk, reason, force = false) => {
    const config = configRef.current
    
    if (currentBatchRef.current.length === 0) {
      return
    }
    
    const batchDuration = (currentBatchRef.current.length / config.sampleRate) * 1000
    
    // Don't send if too short (unless it's a stop signal or forced)
    if (!force && batchDuration < config.minSegmentMs && reason !== 'stop') {
      console.log(`[⏭️  Worker] Skip: ${batchDuration.toFixed(0)}ms too short (min: ${config.minSegmentMs}ms)`)
      return
    }
    
    // Snapshot batch for async sending
    const batchSnapshot = new Int16Array(currentBatchRef.current)
    const sendId = ++sendCountRef.current
    const queueSizeAtFlush = audioQueueRef.current.length
    
    console.log(`[🚀 Flush #${sendId}] START: ${batchDuration.toFixed(0)}ms, reason: "${reason}", queue: ${queueSizeAtFlush} chunks, active sends: ${activeSendsRef.current}`)
    
    // Calculate overlap and prepare next batch immediately
    // CRITICAL: Overlap ensures continuity between segments for rolling flush
    const overlapSamples = Math.floor((config.sampleRate * config.overlapMs) / 1000)
    const overlapData = Array.from(batchSnapshot.slice(-Math.min(overlapSamples, batchSnapshot.length)))
    
    // Reset batch with overlap BEFORE async processing
    currentBatchRef.current = overlapData
    // CRITICAL: Reset timer immediately for accurate rolling flush intervals
    batchStartTimeRef.current = performance.now()
    
    // Fire-and-forget async send (allows overlapping)
    activeSendsRef.current++
    const sendStartTime = performance.now()
    
    setTimeout(() => {
      try {
        // Convert to base64 in chunks to avoid stack overflow
        const uint8Array = new Uint8Array(batchSnapshot.buffer)
        let base64 = ''
        const chunkSize = 32768
        
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length))
          base64 += String.fromCharCode.apply(null, Array.from(chunk))
        }
        base64 = btoa(base64)
        
        const encodeTime = performance.now() - sendStartTime
        
        // Send to backend with metadata (non-blocking)
        onAudioChunk(base64, {
          duration: batchDuration,
          reason: reason,
          overlapMs: config.overlapMs,
          timestamp: Date.now(),
          sendId: sendId,
          queueSize: queueSizeAtFlush
        })
        
        const totalTime = performance.now() - sendStartTime
        activeSendsRef.current--
        
        console.log(`[✅ Flush #${sendId}] COMPLETE: ${batchDuration.toFixed(0)}ms sent, encode: ${encodeTime.toFixed(0)}ms, total: ${totalTime.toFixed(0)}ms, base64: ${base64.length} bytes, active: ${activeSendsRef.current}`)
      } catch (error) {
        console.error(`[❌ Flush #${sendId}] ERROR:`, error)
        activeSendsRef.current--
      }
    }, 0)
  }

  // Get available audio input devices
  const getAudioDevices = useCallback(async () => {
    try {
      // Request permission first to enumerate devices with labels
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => stream.getTracks().forEach(track => track.stop()))
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      
      console.log('[AudioCapture] Available audio input devices:', audioInputs.length)
      audioInputs.forEach((device, i) => {
        console.log(`  ${i + 1}. ${device.label || `Device ${i + 1}`} (${device.deviceId})`)
      })
      
      setAvailableDevices(audioInputs)
      return audioInputs
    } catch (error) {
      console.error('[AudioCapture] Failed to enumerate devices:', error)
      return []
    }
  }, [])

  const startRecording = useCallback(async (onAudioChunk, streaming = false, customConfig = null, inputMode = 'microphone', deviceId = null) => {
    try {
      // Update configuration if provided
      if (customConfig) {
        configRef.current = { ...configRef.current, ...customConfig }
      }
      
      const config = configRef.current
      
      let stream = null
      
      if (inputMode === 'system') {
        // System Audio Mode: Use getDisplayMedia with audio
        console.log('[AudioCapture] Requesting system audio via screen capture...')
        
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true, // Required by some browsers
            audio: {
              echoCancellation: false, // Don't cancel for system audio
              noiseSuppression: false,
              autoGainControl: false
            }
          })
          
          // Check if we actually got audio tracks
          const audioTracks = stream.getAudioTracks()
          const videoTracks = stream.getVideoTracks()
          
          console.log('[AudioCapture] Tracks captured:', {
            audio: audioTracks.length,
            video: videoTracks.length
          })
          
          if (audioTracks.length === 0) {
            // Stop video tracks if we got them
            videoTracks.forEach(track => track.stop())
            throw new Error('No audio track captured. Make sure to select "Share tab audio" or "Share system audio" in the permission dialog, or choose a tab/window that is playing audio.')
          }
          
          // Log audio track settings
          audioTracks.forEach((track, i) => {
            const settings = track.getSettings()
            console.log(`[AudioCapture] Audio track ${i}:`, settings)
          })
          
          // Stop video track immediately if present - we only want audio
          videoTracks.forEach(track => {
            console.log('[AudioCapture] Stopping video track (only need audio)')
            track.stop()
          })
          
          console.log('[AudioCapture] ✅ System audio capture started successfully!')
        } catch (err) {
          if (err.name === 'NotAllowedError') {
            throw new Error('Screen sharing permission denied. Please allow screen sharing and make sure to check "Share tab audio" or "Share system audio" in the dialog.')
          } else if (err.name === 'NotSupportedError') {
            throw new Error('System audio capture is not supported in this browser. Try using Chrome, Edge, or Firefox on desktop.')
          }
          throw err
        }
      } else {
        // Microphone Mode: Use getUserMedia
        const audioConstraints = {
          sampleRate: config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
        
        // If specific device requested, use it
        if (deviceId) {
          audioConstraints.deviceId = { exact: deviceId }
          console.log('[AudioCapture] Requesting specific device:', deviceId)
        } else {
          console.log('[AudioCapture] Requesting default microphone...')
        }
        
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: audioConstraints
        })
        
        // Log which device was actually used
        const tracks = stream.getAudioTracks()
        if (tracks.length > 0) {
          const settings = tracks[0].getSettings()
          console.log('[AudioCapture] ✅ Microphone access granted:', settings.label || 'Unknown device')
          console.log('[AudioCapture] Device settings:', settings)
        }
      }
      
      streamRef.current = stream

      // Set up audio context for PCM capture and level monitoring
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: config.sampleRate
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
        // ====================================================================
        // DOUBLE-BUFFER STREAMING MODE
        // ====================================================================
        const bufferSize = 4096 // 256ms at 16kHz
        const processor = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1)
        audioProcessorRef.current = processor
        
        // Initialize state
        audioQueueRef.current = []
        currentBatchRef.current = []
        batchStartTimeRef.current = performance.now()
        lastSpeechTimeRef.current = performance.now()
        averageEnergyRef.current = 0
        chunkCountRef.current = 0
        activeSendsRef.current = 0
        sendCountRef.current = 0
        
        console.log(`[🎙️  AudioCapture] DOUBLE-BUFFER MODE STARTED`)
        console.log(`[🎙️  AudioCapture] Capture → Queue (non-blocking) | Worker drains every ${config.workerIntervalMs}ms`)
        console.log(`[🎙️  AudioCapture] Max segment: ${config.maxSegmentMs}ms | Overlap: ${config.overlapMs}ms`)
        console.log(`[🎙️  AudioCapture] Queue size: ${config.maxQueueSize} | Silence: ${config.silenceTimeoutMs}ms`)
        
        // ================================================================
        // CAPTURE LOOP: Non-blocking audio processing
        // This NEVER awaits network calls - only pushes to queue
        // ================================================================
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0)
          
          // Convert Float32Array to Int16Array (PCM format)
          const pcmData = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          
          // Calculate RMS energy for VAD (Voice Activity Detection)
          const rms = calculateRMS(pcmData)
          
          // Adaptive threshold using exponential moving average
          // Use slower adaptation (0.98 vs 0.95) for more stable threshold during continuous speech
          averageEnergyRef.current = 0.98 * averageEnergyRef.current + 0.02 * rms
          // Use lower multiplier (1.2 vs 1.5) to avoid false silence detection during speech
          const threshold = Math.max(config.silenceThreshold, averageEnergyRef.current * 1.2)
          
          // Update last speech time if energy exceeds threshold
          if (rms > threshold) {
            lastSpeechTimeRef.current = performance.now()
          }
          
          // Push to queue - NEVER awaits, completely non-blocking
          processAudioChunk(pcmData)
        }
        
        // ================================================================
        // WORKER LOOP: Async batch processor runs independently
        // Drains queue, batches, and sends in background
        // ================================================================
        workerTimerRef.current = setInterval(() => {
          translationWorker(onAudioChunk)
        }, config.workerIntervalMs)
        
        console.log(`[✅ AudioCapture] Capture thread started (non-blocking)`)
        console.log(`[✅ AudioCapture] Worker thread started (${config.workerIntervalMs}ms interval)`)
        
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

  const stopRecording = useCallback((onAudioChunk) => {
    const config = configRef.current
    console.log(`[🛑 AudioCapture] STOPPING RECORDING`)
    
    // Step 1: Stop worker thread immediately
    if (workerTimerRef.current) {
      clearInterval(workerTimerRef.current)
      workerTimerRef.current = null
      console.log(`[⏹️  Worker] Background worker stopped`)
    }
    
    // Step 2: Disconnect audio processor to stop new captures
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect()
      audioProcessorRef.current = null
      console.log(`[⏹️  Capture] Audio processor disconnected`)
    }

    // Step 3: Flush any remaining data in queue + batch
    if (onAudioChunk) {
      // Drain any remaining queue items into batch
      while (audioQueueRef.current.length > 0) {
        const chunk = audioQueueRef.current.shift()
        currentBatchRef.current.push(...chunk)
      }
      
      // Flush final batch if it has data
      if (currentBatchRef.current.length > 0) {
        const finalDuration = (currentBatchRef.current.length / config.sampleRate) * 1000
        console.log(`[🔚 Final Flush] ${finalDuration.toFixed(0)}ms remaining in batch, queue: ${audioQueueRef.current.length}`)
        flushBatch(onAudioChunk, 'stop')
      } else {
        console.log(`[🔚 Final Flush] No remaining data to flush`)
      }
    }

    // Step 4: Clean up MediaRecorder (non-streaming mode)
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }

    // Step 5: Stop all media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // Step 6: Stop level monitoring
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    setAudioLevel(0)

    // Step 7: Clean up audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Step 8: Clear all state
    audioQueueRef.current = []
    currentBatchRef.current = []
    batchStartTimeRef.current = 0
    lastSpeechTimeRef.current = 0
    averageEnergyRef.current = 0
    chunkCountRef.current = 0
    activeSendsRef.current = 0
    sendCountRef.current = 0

    console.log(`[✅ AudioCapture] Recording stopped cleanly - all state cleared`)
    setIsRecording(false)
  }, [isRecording])

  // Method to update configuration dynamically
  const updateConfig = useCallback((newConfig) => {
    configRef.current = { ...configRef.current, ...newConfig }
    console.log(`[🔧 AudioCapture] Config updated:`, configRef.current)
  }, [])

  // Method to get current configuration
  const getConfig = useCallback(() => {
    return { ...configRef.current }
  }, [])

  return {
    startRecording,
    stopRecording,
    isRecording,
    audioLevel,
    updateConfig,
    getConfig,
    getAudioDevices,
    availableDevices
  }
}
