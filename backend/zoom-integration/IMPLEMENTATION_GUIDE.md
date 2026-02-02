# Implementation Guide: Integrating Zoom Token Distribution

This guide explains how to integrate the Zoom token distribution system into your existing `zoom_app_webapp` repository.

## 📋 Overview

You now have a complete backend system for:
1. **OAuth Authentication** with Zoom using Server-to-Server OAuth
2. **ZAK Token Distribution** for meeting hosts (2-hour validity)
3. **OBF Token Distribution** for participants (30-minute validity, meeting-scoped)
4. **Real-time delivery** via WebSocket and HTTP APIs

## 🎯 Step-by-Step Integration

### Step 1: Understand Your Current Repository Structure

First, check what's currently in your `zoom_app_webapp` repository:

```bash
cd zoom_app_webapp
ls -la
```

Common scenarios:
- **Scenario A**: Empty/minimal backend → Use the complete system as-is
- **Scenario B**: Has Express.js backend → Merge the components
- **Scenario C**: Different framework (Next.js, etc.) → Adapt the approach

### Step 2: Copy Files to Your Repository

#### For Scenario A (No Backend Yet):

```bash
# In your zoom_app_webapp directory
mkdir backend
cd backend

# Copy all files from zoom-integration
cp -r /path/to/zoom-integration/* .

# Install dependencies
npm install
```

#### For Scenario B (Existing Express Backend):

```bash
# Copy only the core components
cp /path/to/zoom-integration/services/zoomTokenService.js ./services/
cp /path/to/zoom-integration/routes/meetingRoutes.js ./routes/
cp /path/to/zoom-integration/websocket/websocketHandler.js ./websocket/

# Add dependencies to your package.json
npm install axios socket.io dotenv helmet morgan
```

### Step 3: Configure Environment Variables

```bash
# Copy environment template
cp .env.example .env

# Edit with your Zoom credentials
nano .env
```

Fill in:
```env
ZOOM_CLIENT_ID=your_actual_client_id
ZOOM_CLIENT_SECRET=your_actual_client_secret
ZOOM_ACCOUNT_ID=your_actual_account_id
PORT=3000
```

### Step 4: Integrate into Your Server

#### If Starting Fresh:

```bash
# Just run the provided server
npm start
```

#### If You Have an Existing Express App:

Modify your main server file (e.g., `app.js` or `server.js`):

```javascript
// Add these imports
const ZoomTokenService = require('./services/zoomTokenService');
const WebSocketHandler = require('./websocket/websocketHandler');
const meetingRoutes = require('./routes/meetingRoutes');

// Initialize Zoom service
const zoomConfig = {
  clientId: process.env.ZOOM_CLIENT_ID,
  clientSecret: process.env.ZOOM_CLIENT_SECRET,
  accountId: process.env.ZOOM_ACCOUNT_ID
};
const zoomService = new ZoomTokenService(zoomConfig);

// Make it available to routes
app.locals.zoomService = zoomService;

// Initialize WebSocket (if using)
const wsHandler = new WebSocketHandler(server, zoomService);
app.locals.io = wsHandler.getIO();

// Add routes
app.use('/api', meetingRoutes);
```

### Step 5: Frontend Integration

#### Option A: WebSocket (Recommended for Real-time)

**Install socket.io-client in your frontend:**
```bash
npm install socket.io-client
```

**Create a Zoom client service:**
```javascript
// frontend/services/zoomClient.js
import io from 'socket.io-client';

class ZoomClient {
  constructor() {
    this.socket = io('http://localhost:3000');
    this.setupListeners();
  }

  setupListeners() {
    this.socket.on('meeting:started', (data) => {
      // Handle ZAK token for host
      this.initializeZoomSDK(data.zakToken, data.meetingId);
    });

    this.socket.on('meeting:credentials', (data) => {
      // Handle OBF token for participant
      this.joinZoomMeeting(data.obfToken, data.meetingId);
    });
  }

  authenticate(userId) {
    this.socket.emit('authenticate', { userId });
  }

  startMeeting(meetingId, hostUserId) {
    this.socket.emit('meeting:start', { meetingId, hostUserId });
  }

  joinMeeting(meetingId, participantUserId) {
    this.socket.emit('meeting:join', { meetingId, participantUserId });
  }

  async initializeZoomSDK(zakToken, meetingId) {
    // Initialize Zoom Video SDK with ZAK token
    const client = ZoomVideo.createClient();
    await client.init('en-US', 'CDN');
    await client.join(meetingId, zakToken, userName);
  }

  async joinZoomMeeting(obfToken, meetingId) {
    // Join Zoom meeting with OBF token
    const client = ZoomVideo.createClient();
    await client.init('en-US', 'CDN');
    await client.join(meetingId, obfToken, userName);
  }
}

export default new ZoomClient();
```

**Use in your React/Vue component:**
```javascript
import zoomClient from './services/zoomClient';

function HostComponent() {
  const startMeeting = () => {
    const meetingId = '1234567890';
    const hostUserId = 'host@example.com';
    
    zoomClient.authenticate(hostUserId);
    zoomClient.startMeeting(meetingId, hostUserId);
  };

  return (
    <button onClick={startMeeting}>Start Meeting</button>
  );
}
```

#### Option B: HTTP API (Simpler, Request-Response)

```javascript
// frontend/services/zoomAPI.js
const API_BASE = 'http://localhost:3000/api';

export async function startMeeting(meetingId, hostUserId) {
  const response = await fetch(`${API_BASE}/meetings/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingId, hostUserId })
  });
  
  const { zakToken } = await response.json();
  return zakToken;
}

export async function joinMeeting(meetingId, participantUserId) {
  const response = await fetch(`${API_BASE}/meetings/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingId, participantUserId })
  });
  
  const { obfToken } = await response.json();
  return obfToken;
}

// Use in component
import { startMeeting } from './services/zoomAPI';

async function handleStartMeeting() {
  const zakToken = await startMeeting('1234567890', 'host@example.com');
  // Use zakToken with Zoom Video SDK
  await initializeZoomSDK(zakToken);
}
```

### Step 6: Zoom Video SDK Integration

**Install Zoom Video SDK:**
```bash
npm install @zoom/videosdk
```

**Host workflow with ZAK token:**
```javascript
import ZoomVideo from '@zoom/videosdk';

async function initializeAsHost(zakToken, meetingId) {
  const client = ZoomVideo.createClient();
  
  await client.init('en-US', 'CDN');
  
  await client.join({
    topic: meetingId,
    token: zakToken,
    userName: 'Host Name',
    password: '', // Optional
    enforceGalleryView: false
  });
  
  // Start audio/video
  const stream = client.getMediaStream();
  await stream.startAudio();
  await stream.startVideo();
}
```

**Participant workflow with OBF token:**
```javascript
async function joinAsParticipant(obfToken, meetingId) {
  const client = ZoomVideo.createClient();
  
  await client.init('en-US', 'CDN');
  
  await client.join({
    topic: meetingId,
    token: obfToken,
    userName: 'Participant Name',
    password: ''
  });
  
  // Start audio/video
  const stream = client.getMediaStream();
  await stream.startAudio();
  await stream.startVideo();
}
```

## 🔧 Testing Your Integration

### Test 1: Backend Health Check

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "zoom": "connected"
}
```

### Test 2: Get ZAK Token

```bash
curl -X POST http://localhost:3000/api/meetings/start \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"1234567890","hostUserId":"your@email.com"}'
```

### Test 3: Get OBF Token

```bash
curl -X POST http://localhost:3000/api/meetings/join \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"1234567890","participantUserId":"participant@email.com"}'
```

### Test 4: Run Complete Test Suite

```bash
npm test
# or
node examples/testTokenRetrieval.js
```

## 🎨 UI Examples

### Host Interface Example

```jsx
import React, { useState } from 'react';
import zoomClient from './services/zoomClient';

function HostDashboard() {
  const [meetingId, setMeetingId] = useState('');
  const [meetingStarted, setMeetingStarted] = useState(false);

  const handleStartMeeting = async () => {
    const userId = getCurrentUserId(); // Get from your auth system
    
    // Authenticate with backend
    zoomClient.authenticate(userId);
    
    // Request ZAK token
    zoomClient.startMeeting(meetingId, userId);
    
    setMeetingStarted(true);
  };

  return (
    <div>
      <h1>Host Dashboard</h1>
      <input
        type="text"
        placeholder="Meeting ID"
        value={meetingId}
        onChange={(e) => setMeetingId(e.target.value)}
      />
      <button onClick={handleStartMeeting}>
        {meetingStarted ? 'Meeting In Progress' : 'Start Meeting'}
      </button>
      <div id="zoom-canvas"></div>
    </div>
  );
}
```

### Participant Interface Example

```jsx
import React, { useState } from 'react';
import { joinMeeting } from './services/zoomAPI';

function ParticipantView({ meetingId }) {
  const [joined, setJoined] = useState(false);

  const handleJoinMeeting = async () => {
    const userId = getCurrentUserId();
    
    try {
      // Get OBF token
      const obfToken = await joinMeeting(meetingId, userId);
      
      // Join Zoom meeting
      await joinZoomMeeting(obfToken, meetingId);
      
      setJoined(true);
    } catch (error) {
      console.error('Failed to join meeting:', error);
    }
  };

  return (
    <div>
      <h2>Meeting: {meetingId}</h2>
      {!joined ? (
        <button onClick={handleJoinMeeting}>Join Meeting</button>
      ) : (
        <div id="zoom-canvas"></div>
      )}
    </div>
  );
}
```

## 🔐 Security Best Practices

### 1. Environment Variables
```bash
# Never commit .env to git
echo ".env" >> .gitignore

# Use different credentials for dev/staging/prod
# Development: .env.development
# Production: .env.production
```

### 2. User Authentication
```javascript
// Add authentication middleware
const authenticate = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  const authToken = req.headers['authorization'];
  
  // Verify user is authenticated with your system
  if (!isValidUser(userId, authToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.userId = userId;
  next();
};

// Apply to routes
app.post('/api/meetings/start', authenticate, async (req, res) => {
  // Only authenticated users can start meetings
});
```

### 3. Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 4. CORS Configuration
```javascript
// Restrict to your domains only
app.use(cors({
  origin: [
    'https://yourdomain.com',
    'https://app.yourdomain.com'
  ],
  credentials: true
}));
```

## 📊 Monitoring & Logging

### Add Winston Logger
```bash
npm install winston
```

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log token requests
logger.info('ZAK token requested', {
  userId: hostUserId,
  meetingId: meetingId,
  timestamp: new Date()
});
```

## 🚀 Deployment

### Docker Deployment

**Create Dockerfile:**
```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

**Create docker-compose.yml:**
```yaml
version: '3.8'
services:
  zoom-backend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ZOOM_CLIENT_ID=${ZOOM_CLIENT_ID}
      - ZOOM_CLIENT_SECRET=${ZOOM_CLIENT_SECRET}
      - ZOOM_ACCOUNT_ID=${ZOOM_ACCOUNT_ID}
      - NODE_ENV=production
    restart: unless-stopped
```

### Heroku Deployment

```bash
# Install Heroku CLI
# Create Heroku app
heroku create your-zoom-app

# Set environment variables
heroku config:set ZOOM_CLIENT_ID=your_client_id
heroku config:set ZOOM_CLIENT_SECRET=your_client_secret
heroku config:set ZOOM_ACCOUNT_ID=your_account_id

# Deploy
git push heroku main
```

## 📞 Support & Resources

- **Zoom Documentation**: https://developers.zoom.us/docs/video-sdk/
- **Example Files**: Check `examples/` directory
- **Test Scripts**: Run `npm test`

## ✅ Checklist

Before going live, ensure:

- [ ] Environment variables configured
- [ ] Zoom app activated with correct scopes
- [ ] Backend server tested (health check passes)
- [ ] ZAK token retrieval working
- [ ] OBF token retrieval working
- [ ] Frontend integrated with backend
- [ ] Zoom Video SDK initialized correctly
- [ ] Authentication/authorization implemented
- [ ] CORS configured for your domain
- [ ] Rate limiting enabled
- [ ] Logging configured
- [ ] Error handling tested
- [ ] March 2, 2026 compliance verified

---

**Questions?** Review the main README.md or check the example files in the `examples/` directory.
