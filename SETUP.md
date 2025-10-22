# Setup Guide - IMPORTANT!

## 🚨 Critical Issue Found

**The WebSocket connection error is caused by a missing `.env` file!**

The backend needs your Google Gemini API key to connect to the translation service.

---

## ✅ Quick Fix

### Step 1: Create the `.env` file

In the **project root** (same directory as `env.example`), create a file called `.env`:

```bash
# On Linux/Mac/WSL:
cp env.example .env

# On Windows (PowerShell):
Copy-Item env.example .env

# On Windows (Command Prompt):
copy env.example .env
```

### Step 2: Add Your API Key

Edit the `.env` file and replace `your_gemini_api_key_here` with your actual API key:

```env
GEMINI_API_KEY=AIzaSyC...your_actual_key_here...
PORT=3001
```

### Step 3: Get a Gemini API Key (if you don't have one)

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key
5. Paste it in your `.env` file

### Step 4: Restart the Server

```bash
# Stop the server if it's running (Ctrl+C)

# Start it again
npm run dev
```

---

## 🔍 Verify It's Working

### Backend Console Should Show:

```
[Backend] Starting Gemini Realtime Translation Server...
[Backend] WebSocket endpoint: ws://localhost:3001/translate
[Backend] API Key configured: Yes ✓  ← This should say "Yes ✓"
[Backend] Server running on port 3001
```

### If You See This - Something's Wrong:

```
[Backend] API Key configured: No ✗ (ERROR!)  ← Bad!
[Backend] ERROR: GEMINI_API_KEY not found in environment variables!
```

**If you see the error above:**
1. Make sure `.env` file exists in the project root
2. Make sure it contains `GEMINI_API_KEY=your_actual_key`
3. Make sure there are no spaces around the `=` sign
4. Restart the server

---

## 📁 File Structure (Should Look Like This)

```
echotranslate/
├── .env                 ← YOU NEED THIS FILE (with your API key)
├── env.example          ← Template (don't edit this)
├── backend/
│   └── server.js
├── frontend/
│   └── ...
└── package.json
```

---

## 🐛 Troubleshooting

### Issue: "WebSocket is closed before connection established"

**Cause**: Missing or invalid API key

**Fix**:
1. Check `.env` file exists in project root
2. Verify API key is correct
3. Restart server

### Issue: Backend logs show "API Key configured: No ✗"

**Fix**:
```bash
# 1. Check if .env exists
ls -la .env  # On Linux/Mac/WSL
dir .env     # On Windows

# 2. If not found, create it
cp env.example .env

# 3. Edit it with your API key
nano .env    # or use any text editor

# 4. Restart
npm run dev
```

### Issue: API key is in .env but still not working

**Fix**:
```bash
# Make sure .env is in the PROJECT ROOT, not in backend/
# The file should be at the same level as package.json

# Check file contents
cat .env  # Should show: GEMINI_API_KEY=AIza...
```

---

## 🔐 Security Notes

1. **NEVER commit `.env` to git** - it's already in `.gitignore`
2. **Keep your API key secret** - don't share it
3. **env.example is safe** - it only contains placeholders

---

## ✅ Testing After Setup

Once your `.env` file is configured:

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Check backend logs** for "API Key configured: Yes ✓"

3. **Open browser** to http://localhost:3000

4. **Click microphone** → Should show 🔴 LIVE badge

5. **Speak** → Translations should appear!

6. **Check browser console** → Should be clean (no errors)

---

## 📞 Still Having Issues?

If you've completed all steps above and still see errors:

1. **Share your backend logs** (the terminal output)
2. **Share your browser console** (F12 → Console tab)
3. **Verify:**
   - `.env` exists in project root
   - API key is valid (try it in AI Studio first)
   - Port 3001 is not in use by another app

---

## 🎉 Success Looks Like

**Backend Console:**
```
[Backend] Starting Gemini Realtime Translation Server...
[Backend] API Key configured: Yes ✓
[Backend] Server running on port 3001
[Backend] New WebSocket client connected
[Backend] Starting session: session_1234567890
[Backend] Connecting to Gemini Multimodal Live API...
[Backend] Connected to Gemini Realtime
[Backend] Gemini setup complete
```

**Browser Console:**
```
WebSocket connected
Translation session ready
```

**UI:**
- ✅ Green "Connected" status
- 🔴 LIVE badge when speaking
- 📝 Translations appearing every 2 seconds
- No errors in console

You're ready to go! 🚀

