# Live Streaming Translation Feature

## Overview

The application now supports **real-time streaming translation**, perfect for conferences, speeches, and live events. Translations appear continuously as the person speaks, not just after they finish.

## How It Works

### Audio Chunking
- Audio is captured and sent in **2-second chunks** while the user is speaking
- Each chunk is immediately processed and translated by Gemini
- Translations appear in real-time as new chunks arrive

### Visual Feedback

#### 1. **LIVE Badge**
When streaming is active, a red "LIVE" badge appears with a pulsing dot:
```
[🔴 LIVE] Streaming translation...
```

#### 2. **Audio Level Indicator**
5 bars show the current audio input level in real-time

#### 3. **Processing Indicator**
A blue pulsing indicator shows when audio is being processed:
```
🔵 Processing audio...
```

#### 4. **Smooth Animations**
New translations fade in smoothly from top to bottom

## Key Changes

### Frontend (`useAudioCapture.js`)
- **Streaming Mode**: New parameter enables continuous chunk sending
- **Chunk Interval**: 2 seconds (configurable via `mediaRecorder.start(2000)`)
- **Audio Settings**: Optimized for speech (16kHz, mono, with noise suppression)

```javascript
// Start recording in streaming mode
await startRecording((audioChunk) => {
  sendMessage({
    type: 'audio',
    audioData: audioChunk,
    sourceLang: sourceLang,
    targetLang: targetLang,
    streaming: true
  })
}, true) // true = streaming mode
```

### Backend (`server.js`)
- Detects streaming mode via `message.streaming` flag
- Processes each audio chunk independently
- Maintains language preferences across chunks
- Logs streaming activity for debugging

### UI Components
1. **TranslationInterface**: Controls streaming mode, displays LIVE badge
2. **TranslationDisplay**: Shows translations with animations, processing indicator
3. **Custom CSS**: FadeIn animation for smooth translation appearance

## Configuration

### Adjust Chunk Duration
To change how frequently audio is sent, modify the interval in `useAudioCapture.js`:

```javascript
// Send chunks every 2 seconds (default)
mediaRecorderRef.current.start(2000)

// For more frequent updates (1 second)
mediaRecorderRef.current.start(1000)

// For less frequent updates (3 seconds)
mediaRecorderRef.current.start(3000)
```

**Recommendations:**
- **Conferences/Speeches**: 2-3 seconds
- **Conversations**: 1-2 seconds
- **Slow speakers**: 3-4 seconds

### Audio Quality Settings
Adjust in `useAudioCapture.js`:

```javascript
audio: {
  sampleRate: 16000,        // Good for speech (lower = smaller files)
  channelCount: 1,          // Mono audio
  echoCancellation: true,   // Remove echo
  noiseSuppression: true,   // Remove background noise
  autoGainControl: true     // Normalize volume
}
```

## User Experience Flow

1. **User clicks microphone button** → Recording starts
2. **LIVE badge appears** → Visual confirmation of streaming
3. **User speaks** → Audio level bars show input
4. **Every 2 seconds** → Audio chunk sent to backend
5. **Backend processes** → Sends to Gemini with language info
6. **Translation arrives** → Appears with smooth animation
7. **Continuous loop** → Steps 4-6 repeat until user stops
8. **User clicks stop** → Recording ends, final chunk processed

## Troubleshooting

### Issue: Translations are delayed
**Solution**: 
- Reduce chunk interval (e.g., from 2000ms to 1000ms)
- Check network latency
- Verify Gemini API response times in backend logs

### Issue: Translations are choppy or incomplete
**Solution**:
- Increase chunk interval (e.g., from 1000ms to 2000ms)
- Ensure complete sentences fit within chunks
- Check audio quality settings

### Issue: Too many translation boxes
**Solution**:
- This is expected behavior for streaming
- Each chunk creates a new translation entry
- Use the download feature to get a clean transcript

### Issue: Audio cuts out
**Solution**:
- Check microphone permissions
- Verify `echoCancellation` and `noiseSuppression` are enabled
- Try a different browser (Chrome/Edge recommended)

## Technical Details

### Audio Format
- **Input**: WebM with Opus codec
- **Sample Rate**: 16kHz (optimized for speech)
- **Bit Depth**: Automatic (browser-dependent)
- **Channels**: Mono

### Data Flow
```
Microphone → MediaRecorder → 2s chunks → Base64 encode → 
WebSocket → Backend → Gemini API → Translation → 
WebSocket → Frontend → Display with animation
```

### Performance Considerations
- **Bandwidth**: ~8-12 KB per 2-second chunk
- **Latency**: Typically 1-3 seconds total (capture + network + processing)
- **Memory**: Minimal (chunks are not accumulated)
- **CPU**: Low impact (browser handles encoding)

## Future Enhancements

Potential improvements for the streaming feature:

1. **Voice Activity Detection (VAD)**: Only send chunks when voice is detected
2. **Adaptive Chunking**: Adjust chunk size based on speech patterns
3. **Sentence Boundary Detection**: Split at natural pauses
4. **Translation Merging**: Combine related chunks into coherent sentences
5. **Buffering**: Pre-buffer audio to reduce initial latency
6. **Quality Indicators**: Show confidence scores for translations

## Comparison: Streaming vs Non-Streaming

| Feature | Streaming Mode | Non-Streaming Mode |
|---------|---------------|-------------------|
| Update Frequency | Every 2 seconds | After stopping |
| Use Case | Live events | Short phrases |
| Latency | ~1-3 seconds | Immediate after stop |
| Translations | Multiple chunks | Single result |
| Best For | Long speeches | Quick translations |

## Example Usage

### Conference Setting
```
Speaker: "Good morning everyone. Thank you for joining us today..."
         [2 seconds - chunk sent]
Result:  "Buenos días a todos. Gracias por acompañarnos hoy..."
         
Speaker: "I'd like to talk about our new product features..."
         [2 seconds - chunk sent]
Result:  "Me gustaría hablar sobre las nuevas características de nuestro producto..."
```

Each translation appears ~1-3 seconds after the words are spoken.

## Additional Notes

- Streaming mode is **always enabled** for the main voice translation interface
- The DemoPage (text translation) does not use streaming (not needed)
- All translations are stored in the session and can be downloaded
- The system maintains language preferences across all chunks in a session

