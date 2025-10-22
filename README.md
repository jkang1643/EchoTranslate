# Real-Time Translation App

A production-quality web application that performs **real-time speech translation** using the **Google Gemini Realtime API**. The app captures live microphone input, streams it to the Gemini API, and displays translated text with optional audio playback.

## 🚀 Features

- **🎙️ Live Streaming Translation** - Real-time translation as you speak (perfect for conferences!)
- **📡 Continuous Audio Streaming** - Audio sent in 2-second chunks for live updates
- **🌍 Multi-language support** (10+ languages)
- **📝 Live captions** showing both original and translated text
- **🔊 Audio playback** for translated speech
- **💬 Text demo mode** for testing without microphone
- **⚡ Low latency** WebSocket communication
- **🎨 Modern UI** with Tailwind CSS and smooth animations
- **📊 Connection status** and latency monitoring
- **💾 Transcript download** functionality
- **🔴 LIVE badge** indicator during active streaming

## 🏗️ Architecture

```
Frontend (React) ←→ WebSocket ←→ Node.js Backend ←→ Gemini Realtime API
```

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express + WebSocket
- **AI**: Google Gemini Realtime API
- **Communication**: WebSocket for real-time data streaming

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Gemini API key
- Modern browser with microphone access

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd realtime-translation-app
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3001
   ```

4. **Get a Gemini API key**
   - Visit [Google AI Studio](https://aistudio.google.com/)
   - Create a new project
   - Generate an API key
   - Add it to your `.env` file

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

This starts both the backend (port 3001) and frontend (port 3000) concurrently.

### Production Mode
```bash
npm run build
npm start
```

## 🎯 Usage

### Live Streaming Voice Translation (Recommended for Conferences/Speeches)
1. Open the app in your browser
2. Select source and target languages
3. **Click the microphone button** to start live streaming
4. **Look for the "🔴 LIVE" badge** - this confirms streaming is active
5. **Start speaking** - translations appear every 2 seconds as you talk!
6. **Keep speaking** - no need to stop, translations update continuously
7. **Click the microphone again** to stop streaming
8. **Download transcript** using the download button

**Perfect for:**
- Conference presentations
- Live speeches
- Multi-lingual meetings
- Real-time interpretation

### Text Demo (Quick Translations)
1. Switch to the "Text Demo" tab
2. Enter text to translate
3. Click "Translate" to see results
4. Use audio playback for translated text

## 🔧 Configuration

### Language Support
The app supports 10+ languages:
- English, Spanish, French, German, Italian
- Portuguese, Russian, Japanese, Korean, Chinese

### Audio Settings
- **Sample Rate**: 16kHz (optimized for speech)
- **Channels**: Mono
- **Format**: WebM with Opus codec
- **Chunk Size**: 2 seconds (for streaming)
- **Echo Cancellation**: Enabled
- **Noise Suppression**: Enabled
- **Auto Gain Control**: Enabled

### Streaming Configuration
- **Update Frequency**: Every 2 seconds
- **Mode**: Continuous streaming (not batch)
- **Latency**: ~1-3 seconds total
- See `STREAMING_TRANSLATION.md` for detailed configuration options

## 📁 Project Structure

```
realtime-translation-app/
├── backend/
│   ├── server.js                    # Express + WebSocket server with streaming
│   └── package.json                 # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── TranslationInterface.jsx  # Main streaming interface
│   │   │   ├── TranslationDisplay.jsx    # Live translation display
│   │   │   └── ...                       # Other components
│   │   ├── hooks/
│   │   │   ├── useAudioCapture.js        # Streaming audio capture
│   │   │   └── useWebSocket.js           # WebSocket connection
│   │   └── App.jsx                       # Main app component
│   └── package.json                      # Frontend dependencies
├── package.json                          # Root package.json
├── env.example                           # Environment variables template
├── README.md                             # This file
├── STREAMING_TRANSLATION.md              # Detailed streaming docs
└── LANGUAGE_TESTING.md                   # Language testing guide
```

## 🔌 API Endpoints

### WebSocket Endpoints
- `ws://localhost:3001` - Main WebSocket connection

### HTTP Endpoints
- `GET /health` - Health check
- `GET /` - Serve frontend (production)

### WebSocket Message Types

#### Client → Server
```javascript
// Initialize session
{
  type: 'init',
  sourceLang: 'en',
  targetLang: 'es'
}

// Send audio data (streaming mode)
{
  type: 'audio',
  audioData: 'base64_encoded_audio',
  sourceLang: 'en',
  targetLang: 'es',
  streaming: true  // Indicates continuous streaming
}

// Send text for translation
{
  type: 'text',
  text: 'Hello world'
}
```

#### Server → Client
```javascript
// Session ready
{
  type: 'session_ready',
  sessionId: 'uuid',
  message: 'Translation session ready'
}

// Translation result
{
  type: 'translation',
  originalText: 'Hello',
  translatedText: 'Hola',
  timestamp: 1234567890
}

// Error
{
  type: 'error',
  message: 'Error description'
}
```

## 🧪 Testing

### Manual Testing
1. **Voice Translation**: Test with different languages
2. **Text Demo**: Verify text translation works
3. **Audio Playback**: Check if translated audio plays
4. **Connection**: Test WebSocket connection stability

### Browser Compatibility
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 🚨 Troubleshooting

### Common Issues

1. **Microphone not working**
   - Check browser permissions
   - Ensure HTTPS in production
   - Try different browsers

2. **WebSocket connection failed**
   - Check if backend is running on port 3001
   - Verify firewall settings
   - Check browser console for errors

3. **Translation not working**
   - Verify Gemini API key is correct
   - Check API quota limits
   - Ensure internet connection

4. **Audio playback issues**
   - Check browser audio permissions
   - Try different audio formats
   - Verify Web Audio API support

### Debug Mode
Enable debug logging by setting:
```javascript
localStorage.setItem('debug', 'true')
```

## 🔒 Security

- API keys are never exposed to the frontend
- All Gemini communication goes through the backend
- WebSocket connections are validated
- Audio data is processed securely

## 📈 Performance

- **Streaming Latency**: 1-3 seconds for live audio translation
- **Text Latency**: < 500ms for text-only translation
- **Audio Chunks**: 2-second segments for optimal balance
- **Bandwidth**: ~8-12 KB per 2-second audio chunk
- **Memory**: Optimized for long-running sessions (chunks not accumulated)
- **CPU**: Low impact (browser handles audio encoding)
- **Concurrent Sessions**: Supports multiple simultaneous users

## 🚀 Deployment

### Environment Variables
```bash
GEMINI_API_KEY=your_api_key
PORT=3001
NODE_ENV=production
```

### Production Build
```bash
npm run build
npm start
```

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Verify API key and permissions
4. Create an issue on GitHub

## 🔮 Future Enhancements

- [x] **Live streaming translation** (✅ Completed!)
- [x] **Continuous audio chunking** (✅ Completed!)
- [ ] Voice Activity Detection (VAD) for smart chunking
- [ ] Multi-user sessions
- [ ] Language auto-detection
- [ ] Custom voice models
- [ ] Offline mode
- [ ] Mobile app
- [ ] Sentence boundary detection
- [ ] Translation merging for coherent output
- [ ] Translation history and search
- [ ] Custom language models

---

**Built with ❤️ using React, Node.js, and Google Gemini AI**
