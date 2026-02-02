# 🚀 Quick Start Guide

Get your Zoom token distribution system running in 5 minutes!

## ⚡ 1. Prerequisites Check

```bash
# Check Node.js version (need >= 16.0.0)
node --version

# If not installed, download from: https://nodejs.org/
```

## 📥 2. Get Zoom Credentials

1. Go to **[Zoom Marketplace](https://marketplace.zoom.us/develop/create)**
2. Click **Create** → Select **Server-to-Server OAuth**
3. Fill in app details and click **Create**
4. Copy your credentials:
   - **Client ID**
   - **Client Secret**
   - **Account ID** (from App Credentials page)
5. Add scopes:
   - `user:read:admin`
   - `meeting:write:admin`
6. Click **Activate** app

## ⚙️ 3. Setup (30 seconds)

```bash
# Navigate to the zoom-integration folder
cd zoom-integration

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your credentials
# Replace the placeholders with your actual Zoom credentials
nano .env  # or use any text editor
```

Your `.env` should look like:
```env
ZOOM_CLIENT_ID=AbCdEfGh123456
ZOOM_CLIENT_SECRET=aBcDeFgHiJkLmNoPqRsTuVwXyZ123456
ZOOM_ACCOUNT_ID=AbC_DeFgHiJkL
PORT=3000
```

## 🎯 4. Start the Server

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║        Zoom Token Distribution Server Started             ║
╚════════════════════════════════════════════════════════════╝

🚀 Server running on port: 3000
📡 WebSocket available at: ws://localhost:3000
🌐 HTTP API available at: http://localhost:3000

🔐 Testing Zoom OAuth connection...
✅ Successfully authenticated with Zoom
```

## ✅ 5. Test It (1 minute)

### Option A: Run the test script
```bash
npm test
```

### Option B: Test with curl

**Health check:**
```bash
curl http://localhost:3000/api/health
```

**Get ZAK token (host):**
```bash
curl -X POST http://localhost:3000/api/meetings/start \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "1234567890",
    "hostUserId": "me"
  }'
```

**Get OBF token (participant):**
```bash
curl -X POST http://localhost:3000/api/meetings/join \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "1234567890",
    "participantUserId": "me"
  }'
```

If you see tokens in the response, **you're ready to go!** 🎉

## 🔧 Troubleshooting

### Problem: "OAuth authentication failed"

**Solution:**
1. Check credentials in `.env` match Zoom Marketplace
2. Ensure app is **Activated** in Zoom Marketplace
3. Verify scopes are added: `user:read:admin`, `meeting:write:admin`

### Problem: "Failed to fetch ZAK/OBF token"

**Solution:**
1. Replace `"me"` with your actual Zoom user email
2. Verify user exists in your Zoom account
3. Check meeting ID is valid (use actual meeting ID)

### Problem: Port 3000 already in use

**Solution:**
```bash
# Change PORT in .env
PORT=3001

# Or kill the process using port 3000
lsof -ti:3000 | xargs kill -9
```

## 📚 Next Steps

1. **Read the full documentation**: `README.md`
2. **Check examples**: Look in `examples/` folder
3. **Integration guide**: `IMPLEMENTATION_GUIDE.md`
4. **Visual diagrams**: `WORKFLOW_DIAGRAMS.md`

## 🎓 Example Usage

### JavaScript/Node.js
```javascript
const axios = require('axios');

async function startMeeting() {
  const response = await axios.post('http://localhost:3000/api/meetings/start', {
    meetingId: '1234567890',
    hostUserId: 'host@example.com'
  });
  
  const zakToken = response.data.zakToken;
  console.log('ZAK Token:', zakToken);
  
  // Use with Zoom Video SDK
  // await client.join(meetingId, zakToken, userName);
}

startMeeting();
```

### React
```jsx
import { useState } from 'react';

function MeetingComponent() {
  const [zakToken, setZakToken] = useState(null);

  const startMeeting = async () => {
    const response = await fetch('http://localhost:3000/api/meetings/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId: '1234567890',
        hostUserId: 'host@example.com'
      })
    });
    
    const data = await response.json();
    setZakToken(data.zakToken);
    
    // Initialize Zoom SDK with zakToken
  };

  return (
    <button onClick={startMeeting}>Start Meeting</button>
  );
}
```

### Python
```python
import requests

def start_meeting():
    response = requests.post(
        'http://localhost:3000/api/meetings/start',
        json={
            'meetingId': '1234567890',
            'hostUserId': 'host@example.com'
        }
    )
    
    data = response.json()
    zak_token = data['zakToken']
    print(f'ZAK Token: {zak_token}')
    
    # Use with Zoom SDK

start_meeting()
```

## 📞 Need Help?

- **Documentation**: Check `README.md`
- **Examples**: Run files in `examples/` folder
- **Zoom Docs**: https://developers.zoom.us/docs/video-sdk/

---

**You're all set!** Start building your Zoom integration. 🚀
