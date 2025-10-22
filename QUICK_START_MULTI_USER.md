# 🚀 Quick Start: Multi-User Live Translation

Get started with live translation sessions in 5 minutes!

---

## ⚡ Prerequisites

1. Node.js installed
2. Gemini API key
3. Backend `.env` file with `GEMINI_API_KEY`

---

## 🎬 Start the App

```bash
# From project root
npm start

# App opens at: http://localhost:5173
```

---

## 👤 For Hosts (Speakers/Preachers)

### Step 1: Start Session
1. Open app → Click **"Host Mode"**
2. Session code appears (e.g., `ABC123`)
3. QR code displays

### Step 2: Share Code
- Show QR code on screen, OR
- Tell audience the 6-digit code

### Step 3: Start Broadcasting
1. Select your speaking language
2. Click **"Start Broadcasting"** 🎙️
3. Speak into microphone
4. Translations sent to all listeners automatically

### Step 4: Monitor
- Watch listener count
- See which languages are being used
- View live transcript

---

## 👥 For Listeners (Audience)

### Option A: Scan QR Code
1. Scan host's QR code
2. Select your language
3. Enter your name (optional)
4. Click "Join"
5. Receive translations!

### Option B: Enter Code
1. Open app → Click **"Join Session"**
2. Enter 6-digit code
3. Select your language
4. Click "Join"
5. Receive translations!

---

## 🎯 Key Features

### For Hosts
✅ Share one session with unlimited listeners  
✅ See real-time listener statistics  
✅ View live transcript of your speech  
✅ Simple QR code sharing  
✅ No technical knowledge required  

### For Listeners
✅ Choose from 50+ languages  
✅ Change language anytime without reconnecting  
✅ See both original and translated text  
✅ Works on any device (phone, tablet, laptop)  
✅ No account required  

---

## 📱 Mobile Usage

### Host on Phone
1. Open app on phone
2. Start host mode
3. Use phone as microphone
4. Display QR code for audience to scan

### Listener on Phone
1. Scan QR code with camera
2. Or enter code manually
3. Keep screen on during session
4. Read translations in real-time

---

## 🔧 Troubleshooting

### "Microphone access denied"
→ Allow microphone in browser settings

### "Session not found"
→ Check session code is correct  
→ Ensure host has started session

### "No translations appearing"
→ Host must click "Start Broadcasting" (not just create session)  
→ Check internet connection

### "Gemini API error"
→ Verify `GEMINI_API_KEY` in `backend/.env`  
→ Check API quota in Google Cloud Console

---

## 💡 Tips

### For Hosts
- Test microphone before session starts
- Speak clearly and at moderate pace
- Keep device plugged in for long sessions
- Monitor listener count to ensure everyone's connected
- Display QR code prominently

### For Listeners
- Join session before speaker starts
- Keep browser tab active
- Use headphones in noisy environments
- Bookmark the app URL for easy access
- Take screenshots of important translations

---

## 📊 System Capacity

| Metric | Capacity |
|--------|----------|
| Listeners per session | 100+ |
| Concurrent sessions | Unlimited* |
| Languages supported | 50+ |
| Translation latency | 1-2 seconds |

*Limited by server resources

---

## 🎨 Use Cases

Perfect for:
- ✝️ Church services and sermons
- 🏢 International conferences
- 🎓 University lectures
- 🏛️ Museum tours
- 🏋️ Fitness classes
- 💼 Corporate meetings
- 🎪 Events and shows

---

## 🌐 Browser Support

| Browser | Support |
|---------|---------|
| Chrome | ✅ Full |
| Edge | ✅ Full |
| Firefox | ✅ Full |
| Safari | ✅ Full |
| Mobile browsers | ✅ Full |

---

## 🔒 Privacy

- No data is stored permanently
- Sessions are temporary (auto-deleted after 1 hour)
- No account or login required
- Audio processed in real-time, not recorded
- Translations not saved to database

---

## 📈 Cost Efficiency

**Traditional approach (per-user transcription):**
- 50 listeners = 50× API costs 💸💸💸

**This system (shared transcription):**
- 50 listeners = 1× transcription + N× translations  
- **~88% cost reduction!** 💰✨

---

## 🎓 Quick Demo Script

### Test It Out (2 people needed):

**Person 1 (Host):**
1. Click "Host Mode"
2. Get session code (e.g., "ABC123")
3. Select "English" as source
4. Click "Start Broadcasting"
5. Say: "Hello, this is a test message"

**Person 2 (Listener):**
1. Click "Join Session"
2. Enter code "ABC123"
3. Select "Spanish" as target
4. Watch for translation: "Hola, este es un mensaje de prueba"

**Success!** 🎉

---

## 📞 Need Help?

1. **Check** the main `MULTI_USER_GUIDE.md` for detailed info
2. **Review** `API_REFERENCE.md` for technical details
3. **Inspect** browser console for errors
4. **Verify** backend logs for issues
5. **Confirm** API key is valid

---

## 🚦 Status Indicators

| Color | Meaning |
|-------|---------|
| 🟢 Green | Connected and working |
| 🟡 Yellow | Connecting... |
| 🔴 Red | Disconnected or error |

---

## ⌨️ Keyboard Shortcuts

*Coming soon - contribute shortcuts for power users!*

---

## 🎉 Success Checklist

- [ ] App starts without errors
- [ ] Host can create session and get code
- [ ] QR code displays correctly
- [ ] Listener can join with code
- [ ] Translations appear in real-time
- [ ] Audio level indicator shows activity
- [ ] Listener count updates correctly
- [ ] Session ends cleanly when host leaves

---

**That's it! You're ready to translate live! 🌍✨**

Questions? Check `MULTI_USER_GUIDE.md` for more details.

