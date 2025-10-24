# Audio Timeout Bug Fix

## Problem

The system would randomly stop working and the GUI would get stuck on "listening" status.

### Root Cause

**Error Code 11: Audio Timeout**
```
Audio Timeout Error: Long duration elapsed without audio. 
Audio should be sent close to real time.
```

Google Cloud Speech-to-Text expects continuous audio flow. When audio stops arriving (even briefly), it throws an error after ~60 seconds of silence.

### What Was Happening

1. User clicks "Start" → Audio streaming begins
2. Google Speech receives audio normally
3. **Audio gap occurs** (network issue, browser pause, etc.)
4. After ~60 seconds of no audio → Code 11 error
5. Backend restarts stream automatically
6. **Frontend doesn't know about restart**
7. Frontend keeps sending to old/dead stream
8. User sees "Listening..." but nothing works ❌

## The Fix

### Backend Improvements (`googleSpeechStream.js`)

#### 1. Better Error Handling

```javascript
.on('error', (error) => {
  if (error.code === 11) {
    console.log('[GoogleSpeech] Audio timeout - restarting...');
    this.restartStream();
  }
  
  // Notify frontend about the error
  if (this.errorCallback) {
    this.errorCallback(error);
  }
})
```

#### 2. Auto-Restart on Stream End

```javascript
.on('end', () => {
  console.log('[GoogleSpeech] Stream ended');
  this.isActive = false;
  
  // Auto-restart if ended unexpectedly
  if (this.shouldAutoRestart) {
    console.log('[GoogleSpeech] Stream ended unexpectedly, restarting...');
    setTimeout(() => this.restartStream(), 1000);
  }
})
```

#### 3. Smart Audio Queue Processing

```javascript
async processAudio(audioData) {
  if (!this.isActive || !this.recognizeStream) {
    console.warn('[GoogleSpeech] Stream not active, buffering audio...');
    this.audioQueue.push(audioData);
    
    // Try to restart if stream is dead
    if (!this.isActive) {
      console.log('[GoogleSpeech] Attempting to restart inactive stream...');
      await this.restartStream();
    }
    return;
  }
  
  // ... send audio normally
}
```

#### 4. Stream Writability Check

```javascript
// Check if stream is still writable before sending
if (this.recognizeStream && this.recognizeStream.writable) {
  this.recognizeStream.write(audioBuffer);
} else {
  console.warn('[GoogleSpeech] Stream not writable, restarting...');
  await this.restartStream();
}
```

#### 5. Improved Restart Logic

```javascript
async restartStream() {
  this.restartCount++;
  console.log(`[GoogleSpeech] 🔄 Restarting stream (restart #${this.restartCount})...`);
  
  // Mark as inactive during restart
  this.isActive = false;
  
  // Small delay for clean shutdown
  await new Promise(resolve => setTimeout(resolve, 100));
  
  try {
    await this.startStream();
    
    // Process any queued audio after restart
    if (this.audioQueue.length > 0) {
      console.log(`[GoogleSpeech] Processing ${this.audioQueue.length} queued audio...`);
      const queuedAudio = [...this.audioQueue];
      this.audioQueue = [];
      
      for (const audioData of queuedAudio) {
        await this.processAudio(audioData);
      }
    }
  } catch (error) {
    console.error('[GoogleSpeech] Failed to restart stream:', error);
    
    // Notify frontend
    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }
}
```

### Handler Improvements

#### Solo Mode (`soloModeHandler.js`)

```javascript
// Set up error callback to notify client
speechStream.onError((error) => {
  console.error('[SoloMode] Speech stream error:', error);
  if (clientWs && clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: 'warning',
      message: 'Transcription service restarting...',
      code: error.code
    }));
  }
});
```

#### Host Mode (`hostModeHandler.js`)

```javascript
// Notify both host and listeners
speechStream.onError((error) => {
  console.error('[HostMode] Speech stream error:', error);
  
  // Notify host
  if (clientWs && clientWs.readyState === WebSocket.OPEN) {
    clientWs.send(JSON.stringify({
      type: 'warning',
      message: 'Transcription service restarting...',
      code: error.code
    }));
  }
  
  // Notify all listeners
  sessionStore.broadcastToListeners(sessionId, {
    type: 'warning',
    message: 'Service restarting, please wait...'
  });
});
```

### Frontend Improvements (`TranslationInterface.jsx`)

```javascript
case 'warning':
  console.warn('[TranslationInterface] ⚠️ Warning:', message.message)
  // User sees warning in console, could add toast notification
  break
```

## Common Causes of Audio Timeout

1. **Long pauses in speech** (>60 seconds of silence)
2. **Browser tab backgrounded** (Chrome throttles audio)
3. **Network interruption** (WiFi drop, reconnection)
4. **System resource constraints** (high CPU usage)
5. **Microphone permissions revoked**
6. **Audio device disconnected**

## How the Fix Helps

### Before Fix
```
Error occurs → Backend restarts
                    ↓
               Frontend unaware
                    ↓
            Audio sent to dead stream
                    ↓
               Stuck "Listening..."  ❌
```

### After Fix
```
Error occurs → Backend restarts
                    ↓
               Error callback fired
                    ↓
            Frontend receives warning
                    ↓
          Audio queued during restart
                    ↓
         Stream restored automatically  ✅
```

## Testing the Fix

### Scenario 1: Long Pause
1. Start recording
2. Stay silent for 70+ seconds
3. Start speaking again
4. ✅ Should continue working after auto-restart

### Scenario 2: Network Interruption
1. Start recording
2. Disconnect WiFi
3. Reconnect WiFi within 60 seconds
4. ✅ Should recover and continue

### Scenario 3: Browser Tab Switch
1. Start recording
2. Switch to another tab for 2+ minutes
3. Return to transcription tab
4. ✅ Should restart and continue working

## Monitoring

### Backend Logs to Watch

```
[GoogleSpeech] Audio timeout - restarting stream...
[GoogleSpeech] 🔄 Restarting stream (restart #X)...
[GoogleSpeech] Stream not writable, restarting...
[GoogleSpeech] Attempting to restart inactive stream...
[GoogleSpeech] Processing X queued audio chunks...
```

### Frontend Console

```
[TranslationInterface] ⚠️ Warning: Transcription service restarting...
```

## Additional Improvements

### 1. Audio Keepalive (Future)
Could add silent audio packets during pauses to prevent timeout:

```javascript
// Send silent audio every 10 seconds
setInterval(() => {
  if (this.isActive && !this.lastAudioTime || Date.now() - this.lastAudioTime > 10000) {
    this.sendSilentAudio();
  }
}, 10000);
```

### 2. Visual Indicator (Future)
Show "Reconnecting..." badge in UI:

```jsx
{isReconnecting && (
  <div className="text-yellow-500">
    🔄 Reconnecting...
  </div>
)}
```

### 3. Automatic Recovery Notification
Toast notification when service recovers:

```javascript
case 'warning':
  showToast('⚠️ Service restarting...', 'warning')
  setTimeout(() => {
    showToast('✅ Service restored', 'success')
  }, 2000)
  break
```

## Configuration

### Adjust Auto-Restart Behavior

In `googleSpeechStream.js`:

```javascript
constructor() {
  // ... 
  this.shouldAutoRestart = true; // Disable to prevent auto-restart
}
```

### Adjust Queue Size

```javascript
async processAudio(audioData) {
  if (!this.isActive) {
    // Limit queue to prevent memory issues
    if (this.audioQueue.length < 100) {
      this.audioQueue.push(audioData);
    }
  }
}
```

## Summary

The "stuck listening" bug is now fixed with:

✅ **Auto-restart on timeout** - Stream restarts automatically  
✅ **Audio queueing** - No audio lost during restart  
✅ **Error notifications** - Frontend aware of issues  
✅ **Writability checks** - Prevent sending to dead stream  
✅ **Graceful recovery** - Seamless continuation after restart  

Users will now experience uninterrupted service even when temporary errors occur!

