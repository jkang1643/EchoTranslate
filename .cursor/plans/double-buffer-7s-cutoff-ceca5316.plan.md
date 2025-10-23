<!-- ceca5316-fff4-4d2a-960a-206c094c3c4b 1a3c52c4-64bd-43cd-a26a-b4cec4c61d80 -->
# Double Buffer Architecture with 7-Second Hard Cutoff

## Overview

Implement a true double-buffer streaming architecture where:

- Capture thread continuously feeds a queue (never blocks)
- Worker thread drains queue every 200ms and batches audio
- Hard cutoff at configurable duration (default 7 seconds)
- 500ms overlap between segments to prevent word cutting
- No silence-based early cutoff (only hard time limit)

## Changes Required

### 1. Frontend: `useAudioCapture.js`

**Update configuration parameters:**

```javascript
const MAX_SEGMENT_MS = 7000      // Hard cutoff at 7s (configurable)
const OVERLAP_MS = 500           // Increased from 400ms to 500ms
const WORKER_INTERVAL = 200      // Worker checks every 200ms
```

**Modify `translationWorker()` function:**

- Remove silence-based flush logic
- Implement ONLY hard time-based cutoff at MAX_SEGMENT_MS
- Flush when batch duration reaches the configured limit

**Update flush logic:**

- Change from multiple flush conditions to single hard cutoff
- Log clearly when 7s limit is hit
- Ensure overlap calculation uses 500ms

**Add configurable max duration:**

- Accept maxSegmentDuration parameter in startRecording()
- Pass through to worker logic
- Default to 7000ms if not provided

### 2. Backend: `websocketHandler.js`

The backend already has timing metrics added. Ensure it:

- Properly logs incoming batch metadata (duration, sendId, queueSize)
- Tracks audio chunk timing and Gemini response latency
- Handles overlapping audio sends without blocking

### 3. Component Updates: `HostPage.jsx` or similar

**Add UI control for segment duration:**

- Add slider/input for max segment duration (1-10 seconds)
- Default to 7 seconds
- Pass to useAudioCapture via startRecording()

### 4. Testing & Validation

- Test with 30+ seconds of continuous speech
- Verify segments are cut exactly at configured duration
- Confirm no gaps in transcription
- Check that 500ms overlap prevents word cutting
- Validate queue never blocks capture thread

## Implementation Details

### Flush Conditions (simplified)

```javascript
// OLD (multiple conditions):
if (batchDuration >= MAX_SEGMENT_MS) flush('max_duration')
else if (silence > SILENCE_TIMEOUT) flush('silence')
else if (overflow) flush('overflow')

// NEW (single hard cutoff):
if (batchDuration >= maxSegmentDuration) {
  flush('hard_cutoff_7s')
}
```

### Key Architecture Points

1. **Capture Loop**: Runs continuously at ~256ms chunks, pushes to queue
2. **Worker Loop**: Runs every 200ms, drains queue into batch
3. **Flush Trigger**: Only when batch reaches configured duration (7s default)
4. **Overlap**: Always 500ms to prevent mid-word cuts
5. **Non-blocking**: All sends are fire-and-forget async

## Expected Console Output

```
[📦 Capture] Queue: 12 chunks, 3072ms, Total captured: 120
[⚙️  Worker] Drained 8 chunks from queue → batch size: 112000 samples
[🚀 Flush #5] START: 7000ms, reason: "hard_cutoff_7s", queue: 4 chunks, active sends: 1
[✅ Flush #5] COMPLETE: 7000ms sent, encode: 15ms, total: 23ms, base64: 224000 bytes
```

### To-dos

- [ ] Update useAudioCapture.js parameters: MAX_SEGMENT_MS=7000, OVERLAP_MS=500, add configurable maxSegmentDuration
- [ ] Simplify translationWorker() to use only hard time cutoff, remove silence-based flush
- [ ] Add UI controls for configurable segment duration in HostPage.jsx
- [ ] Test with 30s continuous speech to verify no gaps and proper 7s segmentation