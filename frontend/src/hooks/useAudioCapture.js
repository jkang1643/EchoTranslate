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

  // ====================================================================
  // DOUBLE-BUFFER ARCHITECTURE: Separate Capture Queue + Worker Thread
  // ====================================================================
  
  // CAPTURE THREAD: Continuously writes to this queue (never awaits)
  const audioQueueRef = useRef([])  // Queue of PCM chunks (Int16Array)
  const MAX_QUEUE_SIZE = 30         // Safety cap (~8s of audio @ 256ms chunks)
  
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

  // Tunable parameters for adaptive streaming
  const SAMPLE_RATE = 16000
  const MAX_SEGMENT_MS = 4000      // Flush every 3-4s max
  const MIN_SEGMENT_MS = 1000      // Minimum 1s before sending
  const SILENCE_TIMEOUT = 1500     // 1.5s of silence triggers flush
  const SILENCE_THRESHOLD = 0.015  // RMS threshold for silence detection
  const OVERLAP_MS = 400           // 400ms overlap between segments
  const WORKER_INTERVAL = 200      // Worker runs every 200ms

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
    const queueSize = audioQueueRef.current.length
    
    if (queueSize < MAX_QUEUE_SIZE) {
      audioQueueRef.current.push(pcmChunk)
      chunkCountRef.current++
      
      // Log every 10 chunks for monitoring
      if (chunkCountRef.current % 10 === 0) {
        const queueDuration = audioQueueRef.current.reduce((sum, chunk) => sum + chunk.length, 0) / SAMPLE_RATE * 1000
        console.log(`[📦 Capture] Queue: ${queueSize} chunks, ${queueDuration.toFixed(0)}ms, Total captured: ${chunkCountRef.current}`)
      }
    } else {
      console.warn(`[⚠️  Capture] Queue full (${MAX_QUEUE_SIZE}) - dropping oldest chunk`)
      audioQueueRef.current.shift() // Drop oldest
      audioQueueRef.current.push(pcmChunk)
    }
  }

  // ====================================================================
  // WORKER THREAD: Async batch processor
  // Drains queue, batches segments, sends to Gemini (fire-and-forget)
  // ====================================================================
  const translationWorker = (onAudioChunk) => {
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
    
    // Check if we should flush the current batch
    const batchDuration = (currentBatchRef.current.length / SAMPLE_RATE) * 1000
    const timeSinceBatchStart = now - batchStartTimeRef.current
    const timeSinceLastSpeech = now - lastSpeechTimeRef.current
    
    let flushReason = null
    
    // Flush conditions:
    if (batchDuration >= (MAX_SEGMENT_MS * 0.75) && timeSinceBatchStart >= MAX_SEGMENT_MS) {
      flushReason = 'max_duration_4s'
    } else if (timeSinceLastSpeech > SILENCE_TIMEOUT && batchDuration >= MIN_SEGMENT_MS) {
      flushReason = 'silence_1.5s'
    } else if (batchDuration >= (MAX_SEGMENT_MS * 1.2)) {
      flushReason = 'overflow_protection'
    }
    
    if (flushReason) {
      flushBatch(onAudioChunk, flushReason)
    }
  }

  // ====================================================================
  // BATCH FLUSHER: Fire-and-forget async send
  // Allows overlapping sends - never blocks capture or worker
  // ====================================================================
  const flushBatch = (onAudioChunk, reason) => {
    if (currentBatchRef.current.length === 0) {
      return
    }
    
    const batchDuration = (currentBatchRef.current.length / SAMPLE_RATE) * 1000
    
    // Don't send if too short (unless it's a stop signal)
    if (batchDuration < MIN_SEGMENT_MS && reason !== 'stop') {
      console.log(`[⏭️  Worker] Skip: ${batchDuration.toFixed(0)}ms too short (min: ${MIN_SEGMENT_MS}ms)`)
      return
    }
    
    // Snapshot batch for async sending
    const batchSnapshot = new Int16Array(currentBatchRef.current)
    const sendId = ++sendCountRef.current
    const queueSizeAtFlush = audioQueueRef.current.length
    
    console.log(`[🚀 Flush #${sendId}] START: ${batchDuration.toFixed(0)}ms, reason: "${reason}", queue: ${queueSizeAtFlush} chunks, active sends: ${activeSendsRef.current}`)
    
    // Calculate overlap and prepare next batch immediately
    const overlapSamples = Math.floor((SAMPLE_RATE * OVERLAP_MS) / 1000)
    const overlapData = Array.from(batchSnapshot.slice(-Math.min(overlapSamples, batchSnapshot.length)))
    
    // Reset batch with overlap BEFORE async processing
    currentBatchRef.current = overlapData
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
          overlapMs: OVERLAP_MS,
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
        console.log(`[🎙️  AudioCapture] Capture → Queue (non-blocking) | Worker drains every ${WORKER_INTERVAL}ms`)
        console.log(`[🎙️  AudioCapture] Max segment: ${MAX_SEGMENT_MS}ms | Overlap: ${OVERLAP_MS}ms`)
        
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
          averageEnergyRef.current = 0.95 * averageEnergyRef.current + 0.05 * rms
          const threshold = Math.max(SILENCE_THRESHOLD, averageEnergyRef.current * 1.5)
          
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
        }, WORKER_INTERVAL)
        
        console.log(`[✅ AudioCapture] Capture thread started (non-blocking)`)
        console.log(`[✅ AudioCapture] Worker thread started (${WORKER_INTERVAL}ms interval)`)
        
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
        const finalDuration = (currentBatchRef.current.length / SAMPLE_RATE) * 1000
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

  return {
    startRecording,
    stopRecording,
    isRecording,
    audioLevel
  }
}
