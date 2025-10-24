# OpenAI Realtime API Setup Guide

## Quick Start

This application now uses **OpenAI Realtime API** for real-time speech transcription and translation.

### Prerequisites

1. **OpenAI Account** with API access
2. **OpenAI API Key** with Realtime API access
3. **Node.js** (v16 or higher)
4. **npm** or **yarn**

### Step 1: Get Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)
5. **Important:** Save this key securely - you won't be able to see it again!

### Step 2: Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your API key:

```
OPENAI_API_KEY=sk-your-actual-api-key-here
PORT=3001
NODE_ENV=development
```

### Step 3: Install Dependencies

Install backend dependencies:

```bash
cd backend
npm install
```

Install frontend dependencies:

```bash
cd ../frontend
npm install
```

### Step 4: Start the Application

#### Development Mode

In one terminal, start the backend:

```bash
cd backend
npm run dev
```

In another terminal, start the frontend:

```bash
cd frontend
npm run dev
```

#### Production Mode

Build the frontend:

```bash
cd frontend
npm run build
```

Start the production server:

```bash
cd backend
NODE_ENV=production npm start
```

The application will be available at `http://localhost:3001`

### Step 5: Test the Setup

#### Test 1: Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "activeSessions": 0,
  "liveTranslationSessions": 0,
  "model": "gpt-4o-realtime-preview",
  "apiProvider": "OpenAI",
  "endpoint": "/translate"
}
```

#### Test 2: Translation Endpoint

```bash
curl -X POST http://localhost:3001/test-translation \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, how are you?",
    "sourceLang": "en",
    "targetLang": "es"
  }'
```

Expected response:
```json
{
  "originalText": "Hello, how are you?",
  "translatedText": "Hola, ¿cómo estás?",
  "sourceLang": "English",
  "targetLang": "Spanish"
}
```

#### Test 3: Real-Time Translation

1. Open browser to `http://localhost:5173` (dev) or `http://localhost:3001` (prod)
2. Allow microphone access when prompted
3. Select source language (e.g., English)
4. Select target language (e.g., Spanish)
5. Click "Start Speaking"
6. Speak clearly into your microphone
7. Watch real-time transcription/translation appear!

## Usage Modes

### Solo Mode (Direct Translation)

1. Open the application
2. Select source and target languages
3. Click "Start Speaking"
4. Your speech is transcribed and translated in real-time
5. Click "Stop Speaking" when done

### Host Mode (Multi-User Sessions)

**As Host:**

1. Click "Host a Session"
2. Select your speaking language
3. Share the session code with listeners
4. Click "Start Broadcasting"
5. Speak - all listeners receive translations in their chosen language

**As Listener:**

1. Click "Join Session"
2. Enter the session code from the host
3. Select your preferred language
4. Listen to real-time translations

## Features

### ✅ Continuous Audio Support
- Handles long, uninterrupted speech without dropping words
- No forced pauses required
- Perfect for sermons, lectures, and long presentations

### ✅ Streaming Transcription
- Interim transcripts displayed in near real-time
- Incremental updates as you speak
- Low latency (~1-2 seconds typical)

### ✅ Multi-Language Translation
- 50+ languages supported
- Simultaneous translation to multiple languages
- High-quality translations using GPT-4o

### ✅ Multi-User Sessions
- Host speaks once, multiple listeners in different languages
- Session codes for easy joining
- Real-time broadcast to all listeners

### ✅ Audio Quality Features
- Automatic gain control
- Noise suppression
- Echo cancellation
- Audio level indicators

## Supported Languages

English, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Korean, Chinese (Simplified & Traditional), Arabic, Hindi, Dutch, Polish, Turkish, Bengali, Vietnamese, Thai, Indonesian, Swedish, Norwegian, Danish, Finnish, Greek, Czech, Romanian, Hungarian, Hebrew, Ukrainian, Persian, Urdu, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Swahili, Filipino, Malay, Catalan, Slovak, Bulgarian, Croatian, Serbian, Lithuanian, Latvian, Estonian, Slovenian, Afrikaans

## API Costs

OpenAI Realtime API pricing (check latest at https://openai.com/pricing):

- **Audio input**: ~$0.06 per minute
- **Audio output**: ~$0.24 per minute (if using voice responses)
- **Text input/output**: Varies by model

For translation-only (text mode), costs are lower. Monitor your usage at:
https://platform.openai.com/usage

## Troubleshooting

### "OPENAI_API_KEY is not configured"

**Problem:** The API key is missing or not loaded.

**Solution:**
1. Check `backend/.env` file exists
2. Verify the key starts with `sk-`
3. Make sure there are no extra spaces or quotes
4. Restart the backend server after adding the key

### "WebSocket closed with code 1008"

**Problem:** Authentication failed or API key doesn't have Realtime access.

**Solution:**
1. Verify your API key is valid
2. Check your OpenAI account has sufficient credits
3. Ensure Realtime API access is enabled for your account
4. Try creating a new API key

### "Translation timeout"

**Problem:** The API request is taking too long.

**Solution:**
1. Check your internet connection
2. Verify OpenAI services are operational: https://status.openai.com/
3. Try reducing the audio chunk size if streaming
4. Check for rate limiting in your OpenAI dashboard

### No audio transcription appears

**Problem:** Audio is being captured but not transcribed.

**Solution:**
1. Check browser console for errors
2. Verify microphone permissions are granted
3. Check the audio level indicator shows activity when speaking
4. Ensure the OpenAI Realtime session is connected (check backend logs)
5. Try speaking louder or closer to the microphone
6. Check that audio format is PCM16 at 16kHz (should be automatic)

### High latency or delays

**Problem:** Transcription/translation is slow.

**Solution:**
1. Check your internet connection speed
2. Reduce audio chunk size for faster processing
3. Use a wired connection instead of WiFi if possible
4. Check OpenAI service status
5. Consider geographic location - closer regions may have lower latency

### "Failed to initialize OpenAI Realtime pool"

**Problem:** Backend can't connect to OpenAI Realtime API.

**Solution:**
1. Verify your API key is correct
2. Check firewall isn't blocking WebSocket connections
3. Ensure you have access to the Realtime API (may require waitlist approval)
4. Check backend logs for specific error messages

## Network Configuration

### Local Network Access

To allow other devices on your local network to access the application:

#### On Mac/Linux:

1. Find your local IP:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

2. Share this URL with others on your network:
```
http://YOUR_LOCAL_IP:3001
```

#### On Windows:

1. Find your local IP:
```powershell
ipconfig | findstr IPv4
```

2. Share the URL: `http://YOUR_LOCAL_IP:3001`

### Firewall Configuration

Make sure port 3001 (or your configured PORT) is open in your firewall:

**Mac:**
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /path/to/node
```

**Windows:**
```powershell
New-NetFirewallRule -DisplayName "Node.js" -Direction Inbound -Program "C:\Program Files\nodejs\node.exe" -Action Allow
```

**Linux:**
```bash
sudo ufw allow 3001/tcp
```

## Development

### Project Structure

```
.
├── backend/
│   ├── server.js                    # Main server (OpenAI Realtime)
│   ├── openaiRealtimePool.js       # OpenAI session pool
│   ├── hostModeHandler.js          # Host mode logic
│   ├── soloModeHandler.js          # Solo mode logic
│   ├── translationManager.js       # Translation handling
│   ├── sessionStore.js             # Session management
│   └── .env                        # Your API keys (not in git)
├── frontend/
│   └── src/
│       ├── hooks/
│       │   ├── useAudioCapture.js  # Audio capture (PCM16)
│       │   └── useWebSocket.js     # WebSocket connection
│       └── components/             # React components
└── MIGRATION_NOTES.md             # Full migration details
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Debugging

Enable verbose logging:

```bash
# Backend
DEBUG=* npm run dev

# Frontend
VITE_DEBUG=true npm run dev
```

Check logs:
- Backend logs in terminal where server is running
- Frontend logs in browser console (F12)
- Network tab shows WebSocket messages

## Performance Tips

1. **Use wired connection** for host to minimize latency
2. **Good microphone** improves transcription accuracy
3. **Quiet environment** reduces noise and errors
4. **Clear speech** at moderate pace works best
5. **Monitor API usage** to manage costs

## Security Notes

1. **Never commit `.env` file** - it contains your API key!
2. **Use environment variables** in production
3. **Rotate API keys** regularly
4. **Monitor API usage** for unexpected activity
5. **Use HTTPS** in production for encrypted connections

## Support

- **OpenAI Documentation**: https://platform.openai.com/docs/
- **OpenAI Realtime Guide**: https://platform.openai.com/docs/guides/realtime
- **OpenAI Support**: https://help.openai.com/
- **Status Page**: https://status.openai.com/

## Frequently Asked Questions

**Q: Do I need a paid OpenAI account?**
A: Yes, the Realtime API requires API credits. Free tier may have limitations.

**Q: Can I use this for commercial purposes?**
A: Check the application's LICENSE file and OpenAI's terms of service.

**Q: How accurate is the transcription?**
A: Very accurate with clear audio. Quality depends on:
- Microphone quality
- Background noise
- Speaker clarity
- Language and accent

**Q: Can I add more languages?**
A: Yes! Edit the `LANGUAGE_NAMES` object in backend files to add more languages.

**Q: Is audio stored or recorded?**
A: No. Audio is streamed directly to OpenAI and not stored on the server. Check OpenAI's data retention policy for their handling.

**Q: Can I use a different AI model?**
A: Currently uses `gpt-4o-realtime-preview`. You can modify the model in `openaiRealtimePool.js` if other models become available.

## Next Steps

- ✅ Setup complete? Try the demo page!
- 📱 Test on mobile devices
- 🌐 Deploy to production (see deployment guide)
- 🎤 Host a multi-user session
- 🌍 Test different languages

Enjoy real-time translation! 🎉

