/**
 * AudioWorklet Processor - Runs on separate audio rendering thread
 * This keeps audio processing OFF the main thread for smooth React rendering
 */
class StreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (!input || !input[0]) {
      return true; // Keep processor alive
    }

    const channelData = input[0]; // Mono channel
    
    // Accumulate samples into buffer
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];
      
      // When buffer is full, send to main thread
      if (this.bufferIndex >= this.bufferSize) {
        // Convert Float32 to Int16 PCM format
        const pcmData = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcmData[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Send to main thread
        this.port.postMessage({
          type: 'audio',
          data: pcmData
        });
        
        // Reset buffer
        this.bufferIndex = 0;
      }
    }
    
    return true; // Keep processor alive
  }
}

registerProcessor('stream-processor', StreamProcessor);

