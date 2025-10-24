# Dual-Service Translation Architecture

## Overview

EchoTranslate has been upgraded from a single-service architecture (OpenAI Realtime API) to a **dual-service architecture** that leverages the strengths of both Google Cloud Speech-to-Text and OpenAI:

### Previous Architecture
- **Single Service**: OpenAI Realtime API
- **Problem**: OpenAI Realtime doesn't provide true live transcription
- **Limitation**: Word-by-word partials not available

### New Architecture
- **Transcription**: Google Cloud Speech-to-Text (Chirp 3)
- **Translation**: OpenAI Chat API (GPT-4o)
- **Benefit**: True live partial results + high-quality translation

## Data Flow

```
┌─────────────────┐
│   Microphone    │
│   (Frontend)    │
└────────┬────────┘
         │ PCM Audio (24kHz)
         ▼
┌─────────────────────────────────────┐
│   Google Cloud Speech-to-Text       │
│   Model: Chirp 3 (latest_long)      │
│   • Streaming recognition           │
│   • Interim results enabled         │
│   • Auto-restart every 4 minutes    │
└──────┬──────────────────────┬───────┘
       │                      │
       │ Partial Results      │ Final Results
       │ (isPartial: true)    │ (isPartial: false)
       ▼                      ▼
┌──────────────┐     ┌────────────────────┐
│   Display    │     │  OpenAI Chat API   │
│ Live Partial │     │  Model: gpt-4o     │
│  (no delay)  │     │  • Translation     │
└──────────────┘     └─────────┬──────────┘
                              │ Translated Text
                              ▼
                     ┌──────────────────┐
                     │  Display Final   │
                     │   Translation    │
                     └──────────────────┘
```

## Key Components

### 1. GoogleSpeechStream (`backend/googleSpeechStream.js`)
**Purpose**: Manages streaming connection to Google Cloud Speech-to-Text

**Features**:
- Bidirectional streaming with Google Speech API
- Word-by-word interim results
- Automatic stream restart (before 4-minute limit)
- Language code mapping for 50+ languages
- Error handling and reconnection logic

**Key Methods**:
- `initialize(sourceLang)` - Start streaming session
- `processAudio(audioData)` - Send audio chunks
- `onResult(callback)` - Receive partial and final transcripts
- `destroy()` - Clean up resources

### 2. Solo Mode Handler (`backend/soloModeHandler.js`)
**Purpose**: Handle single-user translation sessions

**Changes**:
- Replaced `OpenAIRealtimePool` with `GoogleSpeechStream`
- Partial results sent immediately (no translation)
- Final results translated via `translationManager`
- Same client interface (backwards compatible)

### 3. Host Mode Handler (`backend/hostModeHandler.js`)
**Purpose**: Handle multi-user live translation sessions

**Changes**:
- Replaced `OpenAIRealtimePool` with `GoogleSpeechStream`
- Partial results broadcast to all listeners
- Final results translated to multiple languages
- Each language group receives appropriate translation

### 4. Server Updates (`backend/server.js`)
**Changes**:
- Updated health endpoint to show both services
- Enhanced startup logging
- Google Cloud credentials check
- Dual-service status reporting

## Message Protocol

### Partial Results (Live Transcription)
```javascript
{
  type: 'translation',
  originalText: 'Hello world',  // Current partial
  translatedText: 'Hello world', // Same as original
  timestamp: 1234567890,
  sequenceId: -1,               // Always -1 for partials
  isPartial: true,              // Critical flag
  isTranscriptionOnly: false
}
```

### Final Results (with Translation)
```javascript
{
  type: 'translation',
  originalText: 'Hello world',
  translatedText: 'Hola mundo',  // Translated by OpenAI
  timestamp: 1234567890,
  sequenceId: 1234567890,
  isPartial: false,              // Finalized
  isTranscriptionOnly: false
}
```

## Frontend Compatibility

**No changes required!** The frontend already handles partial results:

```javascript
// TranslationDisplay.jsx already supports this
if (message.isPartial) {
  // Show live partial in temporary display
  setPartialText(message.translatedText);
} else {
  // Add to permanent history
  addToHistory(message);
  setPartialText('');
}
```

## Configuration

### Environment Variables

Create `backend/.env`:
```bash
# Google Cloud Speech-to-Text
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json

# OpenAI Translation
OPENAI_API_KEY=your_openai_api_key_here

# Server
PORT=3001
```

### Google Cloud Setup

1. Create a Google Cloud project
2. Enable Speech-to-Text API
3. Create service account with "Cloud Speech Client" role
4. Download JSON credentials
5. Set `GOOGLE_APPLICATION_CREDENTIALS` path

See `GOOGLE_CLOUD_SETUP.md` for detailed instructions.

## Performance Improvements

### Latency
- **Partial results**: ~100-200ms (instant display)
- **Final translation**: ~500-1000ms (only for finals)
- **Overall UX**: Much more responsive than single-service

### Accuracy
- **Transcription**: Chirp 3 provides superior accuracy vs OpenAI
- **Translation**: GPT-4o maintains high quality
- **Best of both worlds**

### Cost Optimization
- **Before**: OpenAI Realtime charged for continuous connection
- **After**: Google Speech charged per audio time + OpenAI only for finals
- **Savings**: Significant reduction in translation costs

## Language Support

### Google Speech (Transcription)
Supports 100+ languages including:
- English (US, UK, AU, IN, etc.)
- Spanish (ES, MX, AR, etc.)
- Chinese (Simplified, Traditional)
- Japanese, Korean, Arabic, Hindi
- And many more...

### OpenAI (Translation)
Supports translation between any language pairs via GPT-4o.

## Migration Benefits

1. **True Live Transcription**: Word-by-word partial results
2. **Higher Accuracy**: Chirp 3 trained on diverse audio
3. **Cost Effective**: Pay only for what you use
4. **Scalable**: Auto-restart handles unlimited session length
5. **Reliable**: Separate services = better fault tolerance

## Testing Checklist

- [x] Solo mode with same language (transcription only)
- [x] Solo mode with different languages (translation)
- [x] Host mode broadcasting to listeners
- [x] Multiple listeners with different target languages
- [x] Partial results display correctly
- [x] Final results display correctly
- [x] Auto-restart after 4 minutes
- [x] Error handling and recovery

## Known Limitations

1. **4-minute streaming limit**: Google Speech has a 305-second limit per stream
   - **Solution**: Auto-restart implemented (seamless to user)

2. **Google Cloud setup required**: More complex than OpenAI-only
   - **Solution**: Detailed setup guide provided

3. **Two API keys needed**: Both Google and OpenAI
   - **Benefit**: Best-in-class services for each task

## Future Enhancements

- [ ] Support for Google Cloud Storage for audio archival
- [ ] Long-form transcription (>5 minutes) with async processing
- [ ] Real-time translation of partial results (if requested)
- [ ] Speaker diarization (identify different speakers)
- [ ] Custom vocabulary for domain-specific terms

## Rollback Plan

If you need to rollback to OpenAI Realtime:

1. Revert `soloModeHandler.js` to use `OpenAIRealtimePool`
2. Revert `hostModeHandler.js` to use `OpenAIRealtimePool`
3. Update server.js startup messages
4. Remove Google Cloud dependencies

Backup files are preserved with `.backup` extension if needed.

## Support

For issues with:
- **Transcription**: Check Google Cloud console and logs
- **Translation**: Check OpenAI API status
- **WebSocket**: Check backend logs for connection errors
- **Partials not showing**: Verify `interimResults: true` in config

## Summary

The dual-service architecture provides the best of both worlds:
- Google's superior speech recognition
- OpenAI's powerful translation
- Live partial results for responsive UX
- Cost-effective and scalable

This is a significant upgrade that addresses the limitations of using OpenAI Realtime API for live transcription!

