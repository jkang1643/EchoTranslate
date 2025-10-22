# 🌐 Local Network Testing Guide

Test the multi-user feature using multiple devices on your local network!

---

## 📋 Prerequisites

- All devices on the same WiFi network
- Backend and frontend running on one device (host machine)
- Other devices to test with (phones, tablets, other computers)

---

## 🔧 Setup Steps

### Step 1: Find Your Local IP Address

**On Windows:**
```powershell
# PowerShell or Command Prompt
ipconfig

# Look for "IPv4 Address" under your active network adapter
# Example: 192.168.1.100
```

**On macOS/Linux:**
```bash
# Terminal
ifconfig
# or
ip addr show

# Look for inet address (not 127.0.0.1)
# Example: 192.168.1.100
```

**Quick way (from WSL):**
```bash
hostname -I | awk '{print $1}'
```

Let's say your IP is: **192.168.1.100**

---

### Step 2: Configure Backend to Listen on All Interfaces

The backend should already work, but verify in `backend/server.js`:

```javascript
const port = process.env.PORT || 3001;

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[Backend] Server running on port ${port}`);
  console.log(`[Backend] Local: http://localhost:${port}`);
  console.log(`[Backend] Network: http://YOUR_IP:${port}`);
});
```

If `0.0.0.0` isn't specified, the server only listens on localhost.

---

### Step 3: Configure Frontend for Local IP

Create or update `frontend/.env.local`:

```env
VITE_API_URL=http://192.168.1.100:3001
VITE_WS_URL=ws://192.168.1.100:3001
```

**Replace `192.168.1.100` with your actual IP address!**

---

### Step 4: Update Vite to Listen on All Interfaces

Update `frontend/vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // Add this line
    port: 5173
  }
})
```

---

### Step 5: Start the App

```bash
# From project root
npm start

# The frontend will now show:
# Network: http://192.168.1.100:5173
```

---

## 📱 Testing Scenarios

### Scenario 1: Laptop as Host, Phone as Listener

**On Laptop (Host Machine):**
1. Open browser: `http://192.168.1.100:5173`
2. Click "Host Mode"
3. Note the session code (e.g., "ABC123")
4. Click "Start Broadcasting"
5. Speak into laptop microphone

**On Phone (Listener):**
1. Open browser: `http://192.168.1.100:5173`
2. Scan QR code OR enter session code
3. Select your language
4. Watch translations appear!

### Scenario 2: Multiple Listeners

**Host Device:**
- Run host mode as above

**Listener Device 1:**
- Join with Spanish

**Listener Device 2:**
- Join with French

**Listener Device 3:**
- Join with German

All receive translations simultaneously!

---

## 🔥 Firewall Configuration

If devices can't connect, you may need to allow the ports through your firewall:

### Windows Firewall

```powershell
# Run as Administrator
# Allow port 3001 (backend)
New-NetFirewallRule -DisplayName "Translation Backend" -Direction Inbound -Port 3001 -Protocol TCP -Action Allow

# Allow port 5173 (frontend)
New-NetFirewallRule -DisplayName "Translation Frontend" -Direction Inbound -Port 5173 -Protocol TCP -Action Allow
```

### macOS Firewall

System Preferences → Security & Privacy → Firewall → Firewall Options
- Allow Node.js and npm to accept incoming connections

### Linux (UFW)

```bash
sudo ufw allow 3001/tcp
sudo ufw allow 5173/tcp
```

---

## 📲 QR Code for Easy Access

The QR code will automatically contain your local IP address:
```
http://192.168.1.100:5173?join=ABC123
```

Listeners can scan this QR code with their phone camera and join instantly!

---

## 🐛 Troubleshooting

### "Cannot connect to server"

**Check 1: Verify IP address**
```bash
ping 192.168.1.100
```

**Check 2: Test backend directly**
```bash
# From another device
curl http://192.168.1.100:3001/health
```

**Check 3: Verify firewall**
- Temporarily disable firewall to test
- If it works, add firewall rules as above

### "WebSocket connection failed"

**Check 1: Verify WebSocket URL**
- Should be `ws://192.168.1.100:3001` (not `wss://`)
- Should NOT be `localhost` or `127.0.0.1`

**Check 2: Mixed content**
- If you're using HTTPS anywhere, all connections must be HTTPS/WSS
- For local testing, use HTTP/WS everywhere

### "QR code scan doesn't work"

**Option 1: Manual entry**
- Just type the session code instead

**Option 2: Share link directly**
- Copy link: `http://192.168.1.100:5173?join=ABC123`
- Send via messaging app

### "Phone can't access the app"

**Check 1: Same network**
- Verify phone is on same WiFi network
- Not on cellular data

**Check 2: Network isolation**
- Some WiFi networks isolate devices (guest networks, public WiFi)
- Try on home network

**Check 3: VPN**
- Disable VPN on testing devices
- VPN can block local network access

---

## 🎯 Quick Test Checklist

- [ ] Found your local IP address
- [ ] Created `frontend/.env.local` with IP
- [ ] Updated `vite.config.js` with `host: '0.0.0.0'`
- [ ] Started app with `npm start`
- [ ] Verified network URL shows in console
- [ ] Opened app on host device using IP
- [ ] Opened app on another device using IP
- [ ] Both devices can access the app
- [ ] Created session on one device
- [ ] Joined session from another device
- [ ] Translations working correctly

---

## 💡 Pro Tips

### Tip 1: Use QR Code for Quick Join
- Display QR code on laptop screen
- Other devices scan with camera
- No typing required!

### Tip 2: Test with Mobile Data (Optional)
- To simulate real conference scenario
- Use your phone as WiFi hotspot
- Connect laptop to phone's hotspot
- All other phones connect to same hotspot

### Tip 3: Bookmark the IP URL
- Save `http://192.168.1.100:5173` on all devices
- Quick access for future tests

### Tip 4: Use ngrok for Remote Testing
```bash
# Install ngrok: https://ngrok.com/
ngrok http 3001  # For backend
ngrok http 5173  # For frontend

# Get public URLs like:
# https://abc123.ngrok.io
```

---

## 🌍 Production Considerations

For production deployment:

1. **Use a domain name** instead of IP
2. **Enable HTTPS/WSS** for security
3. **Configure CORS** properly
4. **Use environment variables** for URLs
5. **Add authentication** for host mode
6. **Implement rate limiting**
7. **Use Redis** for session storage (scalability)
8. **Set up monitoring** and logging

---

## 📱 Mobile Browser Compatibility

Tested and working on:
- ✅ Chrome (Android)
- ✅ Safari (iOS)
- ✅ Firefox (Android/iOS)
- ✅ Edge (Android/iOS)
- ✅ Samsung Internet

---

## 🎬 Demo Script for Testing

### 5-Minute Test (2 devices)

**Device 1 (Laptop - Host):**
1. Open `http://192.168.1.100:5173`
2. Click "Host Mode"
3. Session code appears (e.g., "TEST42")
4. Select "English" as source
5. Click "Start Broadcasting"
6. Say: "Hello everyone, welcome to our testing session"

**Device 2 (Phone - Listener):**
1. Open `http://192.168.1.100:5173`
2. Click "Join Session"
3. Enter code "TEST42"
4. Select "Spanish" as target
5. Click "Join"
6. See translation appear:
   "Hola a todos, bienvenidos a nuestra sesión de prueba"

**Success!** 🎉

---

## 📊 Network Requirements

| Requirement | Value |
|-------------|-------|
| Minimum bandwidth | 1 Mbps per device |
| Recommended bandwidth | 5 Mbps for smooth operation |
| Latency | < 100ms on local network |
| Concurrent connections | Limited by WiFi capacity |

---

## 🔐 Security Notes

When testing on local network:

- ⚠️ Anyone on your network can access the app
- ⚠️ Session codes are visible to all
- ⚠️ No authentication by default
- ⚠️ Suitable for trusted networks only

For production, add proper authentication and authorization!

---

**Now you can test like a real conference scenario! 🎤📱**

