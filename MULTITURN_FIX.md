# Gemini Live Multi-Turn Streaming Fix

## Overview
Fixed the WebSocket error (Code 1007: Precondition check failed) that occurred after the first turn completion in Gemini Live streaming. The application now supports continuous, multi-turn conversations without disconnections.

## Root Cause
The original implementation was incorrectly using the `clientContent` API for real-time audio streaming. According to the official Gemini Live API documentation, audio streaming should use the `realtimeInput` API with proper `audioStreamEnd` signaling. The API was rejecting subsequent audio chunks because:

1. Audio streams were not being properly closed with `audioStreamEnd: true`
2. The wrong API (`clientContent` instead of `realtimeInput`) was being used for streaming audio
3. The server expected an explicit audio stream closure before accepting a new stream

## Solution Implemented

### 1. **State Management** (Lines 77-83)
Added state tracking variables to manage the audio streaming lifecycle:
- `isStreamingAudio`: Tracks whether we're currently in an active audio stream
- `setupComplete`: Tracks when Gemini setup is complete and ready for input
- `lastAudioTime`: Tracks the last time audio was received (for silence detection)
- `audioEndTimer`: Timer to detect when the user has stopped speaking
- `AUDIO_END_TIMEOUT`: 2-second silence threshold before ending a turn
- `translationInstructionSent`: Tracks if we've sent the translation instruction for current turn

### 2. **Audio Stream End Signaling** (Lines 85-101)
Created `sendAudioStreamEnd()` function that:
- Sends `{"realtimeInput": {"audioStreamEnd": true}}` to properly close the audio stream
- This is the **KEY FIX** - uses the correct API field as documented in the official API
- Resets the streaming state to prepare for the next turn
- Only triggers when audio streaming is active

### 3. **Audio Message Handling** (Lines 402-470)
Refactored audio message processing to use the **correct `realtimeInput` API** instead of `clientContent`:

**❌ WRONG - Previous approach using clientContent:**
```javascript
{
  clientContent: {
    turns: [{
      role: "user",
      parts: [{
        inlineData: {
          mimeType: 'audio/webm',
          data: audioData
        }
      }]
    }],
    turnComplete: false  // ❌ Wrong API for streaming audio
  }
}
```

**✅ CORRECT - New approach using realtimeInput:**
```javascript
// Step 1: Send translation instruction (first chunk only)
{
  realtimeInput: {
    text: "Translate this from English to Spanish:"
  }
}

// Step 2: Stream audio chunks
{
  realtimeInput: {
    audio: {
      mimeType: 'audio/webm;codecs=opus',
      data: audioData  // Base64 encoded audio
    }
  }
}

// Step 3: After silence detected, close the audio stream
{
  realtimeInput: {
    audioStreamEnd: true  // ✓ Proper stream closure
  }
}
```

**Key features:**
- Uses `realtimeInput.audio` for streaming audio chunks (as per official API docs)
- Sends translation instruction via `realtimeInput.text` at start of each turn
- Automatic silence detection (2 seconds) triggers `audioStreamEnd`
- Support for explicit `audio_end` message from client
- Proper queuing when setup is not complete
- Audio format: `audio/webm;codecs=opus` (matches MediaRecorder output)

### 4. **Server Response Handling** (Lines 115-190)
Enhanced Gemini message handler to properly manage turn lifecycle:

**Setup Complete Handling:**
- Detects when Gemini is ready (`setupComplete: true`)
- Processes any queued messages after setup completes
- Sets `setupComplete` flag to enable message sending

**Turn Complete Handling:**
- Detects when model finishes responding (`serverContent.turnComplete: true`)
- Resets streaming state for next turn
- Clears any pending audio timers
- Notifies client that model is ready for next input

### 5. **Reconnection Logic** (Lines 205-293)
Improved reconnection handling to maintain clean state:

**State Reset on Disconnect:**
- Clears all streaming state variables
- Cancels pending timers
- Resets `setupComplete` flag

**Error-Specific Handling:**
- Code 1007 (Precondition Failed): Logs protocol issue and reconnects with clean state
- Code 1011 (Quota Error): Uses exponential backoff with max retry limit
- Exponential backoff: 500ms → 1s → 2s → 4s

**Post-Reconnect:**
- Waits for `setupComplete` before processing queued messages
- Prevents sending messages before API is ready

### 6. **Client Disconnect Cleanup** (Lines 489-513)
Added proper cleanup when client disconnects:
- Cancels audio end timer
- Closes Gemini WebSocket
- Removes session from active sessions
- Resets all state variables

## State Machine Flow

```
┌─────────────────────────┐
│     Setup Phase         │
│  setupComplete: false   │
└───────────┬─────────────┘
            │ Send setup config
            ▼
┌─────────────────────────┐
│    Setup Complete       │
│  setupComplete: true    │
│  isStreaming: false     │
└───────────┬─────────────┘
            │ User starts speaking
            ▼
┌─────────────────────────┐
│  Send Instruction       │  ← realtimeInput.text: "Translate..."
│  (First chunk only)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Streaming Audio        │  ← realtimeInput.audio: { data, mimeType }
│  isStreaming: true      │  ← Send multiple chunks
│  instructionSent: true  │
└───────────┬─────────────┘
            │ 2s silence OR audio_end message
            ▼
┌─────────────────────────┐
│  Close Audio Stream     │  ← realtimeInput.audioStreamEnd: true
│                         │  ← This is the KEY fix!
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Model Processing       │
│  (Wait for response)    │
└───────────┬─────────────┘
            │ serverContent.turnComplete: true
            ▼
┌─────────────────────────┐
│  Reset for Next Turn    │  ← isStreaming: false
│  Ready for new audio    │  ← instructionSent: false
└───────────┬─────────────┘
            │
            └──────────┐
                       │ User speaks again
                       ▼
            ┌─────────────────────────┐
            │  Send Instruction       │
            │  (New turn starts)      │
            └─────────────────────────┘
```

**Critical Difference from Old Implementation:**
- ✅ Uses `realtimeInput.audio` for streaming (not `clientContent`)
- ✅ Sends `realtimeInput.audioStreamEnd: true` to close stream properly
- ✅ Allows multiple turns without reconnection
- ❌ Old way used `clientContent.turnComplete` which couldn't handle streaming properly

## Testing Instructions

### 1. Start the Application
```bash
npm start
# or
./start.sh  # Linux/Mac
start.bat   # Windows
```

### 2. Test Multi-Turn Conversation
1. Click "Start Streaming Translation"
2. Speak in source language
3. Wait for translation to complete
4. **WITHOUT refreshing**, speak again
5. Verify translation works for 2nd, 3rd, 4th turns
6. Check console for proper state transitions

### 3. Expected Console Output
```
[Backend] Gemini setup complete - ready for realtimeInput
[Backend] Starting new audio stream: English → Spanish
[Backend] Sent translation instruction via realtimeInput.text
[Backend] Sending audio chunk via realtimeInput.audio (streaming: true)
[Backend] Sending audio chunk via realtimeInput.audio (streaming: true)
[Backend] Audio silence detected, sending audioStreamEnd
[Backend] Sending audioStreamEnd signal to close the audio stream
[Backend] Gemini response: {"serverContent":{"modelTurn":...}}
[Backend] Model turn complete - ready for next user input
[Backend] Starting new audio stream: English → Spanish  ← Second turn starts!
[Backend] Sent translation instruction via realtimeInput.text
[Backend] Sending audio chunk via realtimeInput.audio (streaming: true)
...
```

### 4. What Should NOT Happen
- ❌ No more "Code 1007: Precondition check failed" errors
- ❌ No disconnections after first turn
- ❌ No need to refresh page between translations

## Configuration Options

### Adjust Silence Detection Timeout
In `backend/server.js`, line 81:
```javascript
const AUDIO_END_TIMEOUT = 2000; // Milliseconds (currently 2 seconds)
```

Increase for:
- Users who speak slowly with pauses
- Languages with longer natural pauses

Decrease for:
- Faster response times
- Languages with minimal pauses

### Message Queue Size
Line 356, 447, 454:
```javascript
if (messageQueue.length < 10) {  // Max 10 queued messages
```

Increase for:
- High-latency networks
- Frequent reconnections

## Frontend Integration (Optional)

The backend now supports explicit turn ending. You can add this to the frontend:

```javascript
// In useAudioCapture.js or TranslationInterface.jsx
const endAudioTurn = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'audio_end'
    }));
  }
};
```

This allows manual control over when to end a turn, instead of relying on silence detection.

## Files Modified

- **backend/server.js**: Complete refactor of WebSocket handling
  - Lines 77-82: State management
  - Lines 84-99: Turn completion function
  - Lines 115-190: Enhanced message handling
  - Lines 205-293: Improved reconnection logic
  - Lines 396-470: Refactored audio handling
  - Lines 489-513: Client disconnect cleanup

## Backward Compatibility

✅ All existing functionality preserved:
- Text translation still works
- Non-streaming audio works
- Language selection works
- Error handling improved

## Performance Considerations

- **Memory**: Queued messages limited to 10 per type
- **Network**: Audio chunks sent immediately (no buffering delay)
- **CPU**: Single timer per session (minimal overhead)
- **Latency**: Reduced by proper state management (no reconnects)

## Troubleshooting

### Issue: Still getting 1007 errors
- **Check**: Console logs show `turnComplete: false` for chunks
- **Check**: Console shows "Completing audio turn" after silence
- **Solution**: Increase `AUDIO_END_TIMEOUT` if turns end too quickly

### Issue: Translation is slow
- **Check**: Audio chunks are being sent (`Sending audio chunk` logs)
- **Check**: No queue backlog (`queued messages` logs)
- **Solution**: Decrease `AUDIO_END_TIMEOUT` for faster turn completion

### Issue: Turns don't end automatically
- **Check**: Timer is being set (`audioEndTimer` created)
- **Check**: Audio is actually stopping (check browser mic permissions)
- **Solution**: Implement manual `audio_end` button in frontend

## Next Steps (Optional Enhancements)

1. **Voice Activity Detection (VAD)**
   - Use server-side VAD to detect speech end more intelligently
   - Replace timeout-based detection

2. **Interrupt Handling**
   - Allow user to interrupt model response
   - Implement turn cancellation

3. **Streaming Text Display**
   - Display partial translations as they arrive
   - Currently shows only complete responses

4. **Audio Format Optimization**
   - Consider switching to PCM for lower latency
   - Implement format conversion if needed

## API Documentation Reference

The fix is based on the official **Gemini Live API - WebSockets API reference**:

### Key API Messages Used:

1. **BidiGenerateContentRealtimeInput** (for streaming audio)
   - `realtimeInput.audio`: Blob with mimeType and data for audio chunks
   - `realtimeInput.text`: String for real-time text input (used for translation instructions)
   - `realtimeInput.audioStreamEnd`: Boolean to signal end of audio stream

2. **BidiGenerateContentServerContent** (model responses)
   - `serverContent.modelTurn`: Content generated by the model
   - `serverContent.turnComplete`: Boolean indicating model has completed its turn
   - `serverContent.interrupted`: Boolean for barge-in detection

3. **BidiGenerateContentSetup** (session configuration)
   - Must be sent first and wait for `setupComplete`
   - Contains model, generationConfig, systemInstruction

### Important API Notes:

From the official documentation (lines 145-196):
> "BidiGenerateContentRealtimeInput: User input that is sent in real time. The different modalities (audio, video and text) are handled as concurrent streams. This is different from BidiGenerateContentClientContent in a few ways:
> - Can be sent continuously without interruption to model generation.
> - End of turn is not explicitly specified, but is rather derived from user activity (for example, end of speech)."

From lines 184-191:
> "audioStreamEnd: Optional. Indicates that the audio stream has ended, e.g. because the microphone was turned off. This should only be sent when automatic activity detection is enabled (which is the default). **The client can reopen the stream by sending an audio message.**"

This last point is crucial - after sending `audioStreamEnd`, you CAN send new audio messages to start a new stream, which enables multi-turn conversations!

## References

- Gemini Live API Official Docs: https://ai.google.dev/api/multimodal-live
- WebSocket Protocol: RFC 6455
- Original issue: Code 1007 after first turn completion
- Fix: Use `realtimeInput` API with proper `audioStreamEnd` signaling

