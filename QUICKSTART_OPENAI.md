# 🚀 Quick Start - OpenAI Realtime API

This application uses **OpenAI Realtime API** for real-time speech transcription and translation.

## 5-Minute Setup

### 1. Get API Key

Visit https://platform.openai.com/api-keys and create a new key (starts with `sk-`)

### 2. Configure

```bash
cd backend
echo "OPENAI_API_KEY=sk-your-key-here" > .env
echo "PORT=3001" >> .env
```

### 3. Install & Run

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### 4. Test

Open browser to: `http://localhost:5173`

Allow microphone → Select languages → Click "Start Speaking" → Speak! 🎤

## Verify It Works

```bash
# Health check
curl http://localhost:3001/health

# Should show:
# { "status": "ok", "apiProvider": "OpenAI", ... }
```

## Features

✅ Continuous speech (no word drops)
✅ Real-time transcription
✅ Multi-language translation (50+ languages)
✅ Multi-user sessions
✅ Low latency (~1-2 seconds)

## Cost

- **Audio input**: $0.06/minute
- **Translation**: $0.03/1K tokens

Monitor usage: https://platform.openai.com/usage

## Need Help?

- **Setup Guide**: See `OPENAI_SETUP.md`
- **Migration Details**: See `MIGRATION_NOTES.md`
- **Troubleshooting**: See `OPENAI_SETUP.md` → Troubleshooting section

## Common Issues

**"OPENAI_API_KEY not configured"**
→ Check `backend/.env` file exists with your key

**"WebSocket closed with code 1008"**
→ Verify API key is valid and has Realtime API access

**No transcription**
→ Allow microphone permissions in browser

---

That's it! You're ready to go. 🎉

For detailed documentation, see:
- `OPENAI_SETUP.md` - Complete setup guide
- `MIGRATION_COMPLETE.md` - Migration summary
- `MIGRATION_NOTES.md` - Technical details

