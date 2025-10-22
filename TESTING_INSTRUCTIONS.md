# 🧪 Quick Testing Instructions - Local Network

Test the multi-user feature with 2 devices (laptop + phone)!

---

## 🚀 Super Quick Setup (3 Steps)

### Step 1: Run Setup Script

**On Windows:**
```bash
./setup-local-network.bat
```

**On Mac/Linux/WSL:**
```bash
chmod +x setup-local-network.sh
./setup-local-network.sh
```

This will:
- ✅ Detect your local IP address
- ✅ Create configuration file
- ✅ Show you the URLs to use

### Step 2: Start the App

```bash
npm start
```

Wait for both servers to start. You'll see:
```
Backend: http://YOUR_IP:3001
Frontend: http://YOUR_IP:3000
```

### Step 3: Test!

**On your laptop (Device 1):**
```
1. Open: http://YOUR_IP:3000
2. Click "Host Mode"
3. Note the session code (e.g., "ABC123")
4. Click "Start Broadcasting"
5. Speak: "Hello, this is a test"
```

**On your phone (Device 2):**
```
1. Open: http://YOUR_IP:3000
2. Click "Join Session"
3. Enter code: "ABC123"
4. Select language: Spanish
5. Watch translation appear! 🎉
```

---

## 📝 Manual Setup (If Scripts Don't Work)

### 1. Find Your IP Address

**Windows (PowerShell):**
```powershell
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
# Example: 192.168.1.100
```

**Mac/Linux:**
```bash
ifconfig
# or
ip addr show
# Look for inet address (not 127.0.0.1)
```

**WSL:**
```bash
hostname -I | awk '{print $1}'
```

### 2. Create Configuration File

Create `frontend/.env.local` and add (replace with YOUR IP):
```env
VITE_API_URL=http://192.168.1.100:3001
VITE_WS_URL=ws://192.168.1.100:3001
```

### 3. Start and Test

```bash
npm start
```

Then follow Step 3 above!

---

## 🐛 Troubleshooting

### ❌ "Can't connect from phone"

**Solution 1: Check same WiFi**
- Both devices must be on the SAME WiFi network
- Not on cellular data

**Solution 2: Firewall**
```powershell
# Windows (Run as Administrator in PowerShell)
New-NetFirewallRule -DisplayName "Translation App" -Direction Inbound -Port 3000,3001 -Protocol TCP -Action Allow
```

**Solution 3: Test connectivity**
```bash
# From phone's browser, visit:
http://YOUR_IP:3001/health

# Should show: {"status":"ok", ...}
```

### ❌ "WebSocket connection failed"

**Make sure:**
- `.env.local` exists in `frontend/` folder
- URLs use `ws://` not `wss://`
- URLs use your IP, not `localhost`
- Backend is running (check terminal)

### ❌ "Changes not applying"

**Solution:**
```bash
# Stop the app (Ctrl+C)
# Delete node_modules in frontend (optional)
npm start
# Hard refresh browser (Ctrl+Shift+R)
```

---

## 📱 Real-World Testing Scenario

### **Conference Setup:**

**Host (Preacher/Speaker):**
- Laptop connected to projector
- Display QR code on screen
- Start broadcasting

**Listeners (Audience):**
- Phone/tablet users
- Scan QR code or enter code
- Select preferred language
- Receive translations

---

## 🎯 Testing Checklist

Before your event:

- [ ] Setup script completed successfully
- [ ] App starts without errors
- [ ] Can access from laptop using local IP
- [ ] Can access from phone using local IP
- [ ] Host mode creates session
- [ ] QR code displays
- [ ] Phone can scan QR code
- [ ] Listener can join with code
- [ ] Translations appear in real-time
- [ ] Multiple listeners can join
- [ ] Different languages work
- [ ] Session ends cleanly

---

## 💡 Pro Tips

1. **Save the URL**: Bookmark `http://YOUR_IP:3000` on all devices
2. **Test beforehand**: Do a full test run 30 minutes before event
3. **Keep devices charged**: Long sessions drain battery
4. **Use WiFi**: Don't rely on cellular data
5. **Have backup**: Know the session code verbally if QR fails
6. **Monitor stats**: Watch listener count as people join

---

## 🎬 5-Minute Test Script

**Time: 0:00 - Device 1 (Laptop)**
- Open app
- Click "Host Mode"
- Note code: "TEST42"

**Time: 0:30 - Device 2 (Phone)**
- Open same IP address
- Click "Join Session"
- Enter: "TEST42"
- Select: "Spanish"

**Time: 1:00 - Device 1**
- Click "Start Broadcasting"
- Say: "Welcome everyone"

**Time: 1:10 - Device 2**
- See: "Bienvenidos a todos"
- ✅ SUCCESS!

---

## 🔥 Common IP Addresses by Network

| Range | Typical Use |
|-------|-------------|
| 192.168.1.x | Home routers |
| 192.168.0.x | Home routers (older) |
| 10.0.0.x | Some routers |
| 172.16.x.x | Corporate networks |

Your IP will be one of these!

---

## 📞 Quick Help

**Still stuck?**

1. Check both devices on same WiFi
2. Check firewall (try disabling temporarily)
3. Restart app completely
4. Clear browser cache
5. Try different browser
6. Check backend logs for errors

---

**Ready to go live! 🚀**

