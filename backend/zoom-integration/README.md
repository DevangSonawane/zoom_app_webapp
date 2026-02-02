# Zoom Token Distribution System

> Located at `backend/zoom-integration`

A production-ready Node.js backend for distributing Zoom Video SDK tokens (ZAK and OBF) using Server-to-Server OAuth authentication. Compliant with **March 2, 2026** security requirements.

## 🎯 Features

- ✅ **Server-to-Server OAuth** authentication with Zoom
- ✅ **ZAK Token** distribution for meeting hosts (2-hour validity)
- ✅ **OBF Token** distribution for participants with meeting ID scoping (30-minute validity)
- ✅ **Real-time WebSocket** support for instant token delivery
- ✅ **REST API** endpoints for HTTP-based integration
- ✅ **In-memory token caching** (no database required)
- ✅ **Batch token distribution** for multiple participants
- ✅ **March 2, 2026 compliance** for third-party meeting access

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Security Compliance](#security-compliance)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [HTTP API](#http-api)
  - [WebSocket](#websocket)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client Applications                           │
│        (Host Admin Interface + Participant Interfaces)          │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
                │ WebSocket/HTTP              │ WebSocket/HTTP
                │                             │
┌───────────────▼─────────────────────────────▼───────────────────┐
│                   Node.js Backend Server                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          Token Distribution Service                       │  │
│  │  • In-memory cache (access token: 55min TTL)            │  │
│  │  • WebSocket connection management                       │  │
│  │  • Automatic token refresh                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          Zoom API Integration Layer                      │  │
│  │  • OAuth: POST /oauth/token                              │  │
│  │  • ZAK: GET /users/{id}/token?type=zak                   │  │
│  │  • OBF: GET /users/{id}/token?type=onbehalf&meeting_id=X│  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ HTTPS API Calls
                │
┌───────────────▼─────────────────────────────────────────────────┐
│                      Zoom API Platform                           │
│  https://zoom.us/oauth/token                                    │
│  https://api.zoom.us/v2/users/{userId}/token                    │
└─────────────────────────────────────────────────────────────────┘
```

### Token Flow

1. **OAuth Authentication**: Server obtains `access_token` (1-hour validity)
2. **ZAK Retrieval**: Host requests ZAK token to start/join meetings (2-hour validity)
3. **OBF Retrieval**: Participants request OBF tokens scoped to specific meetings (30-minute validity)
4. **Distribution**: Tokens delivered via WebSocket (real-time) or HTTP response

### Why No Database?

Tokens are **short-lived** (30 minutes to 2 hours) and should not be persisted:
- ✅ Reduces security risk (no token theft from DB)
- ✅ Simpler architecture (in-memory cache sufficient)
- ✅ Automatic expiration handling
- ✅ Complies with security best practices

## 🔒 Security Compliance

### March 2, 2026 Deadline

**CRITICAL**: Zoom mandates that all apps joining meetings outside their own developer account must use proper authorization tokens (OBF/ZAK) by **March 2, 2026**.

**This implementation is fully compliant with:**
- ✅ Server-to-Server OAuth (no user interaction required)
- ✅ ZAK tokens for host authentication
- ✅ OBF tokens with meeting ID scoping
- ✅ No hardcoded credentials
- ✅ Short-lived token management

### Required Zoom Scopes

Your Zoom Server-to-Server OAuth app must have these scopes:
- `user:read:admin` - Read user information
- `meeting:write:admin` - Create/manage meetings

## 📦 Prerequisites

- **Node.js** >= 16.0.0
- **Zoom Account** with Server-to-Server OAuth app
- **npm** or **yarn**

### Creating a Zoom Server-to-Server OAuth App

1. Go to [Zoom Marketplace](https://marketplace.zoom.us/develop/create)
2. Click **Create** → Select **Server-to-Server OAuth**
3. Fill in app details:
   - App Name: Your app name
   - Company Name: Your company
   - Developer Contact: Your email
4. Click **Create**
5. Note your credentials:
   - **Client ID**
   - **Client Secret**
   - **Account ID**
6. Add required scopes:
   - `user:read:admin`
   - `meeting:write:admin`
7. **Activate** your app

## 🚀 Installation

### 1. Clone or Copy Files

```bash
# If you have the files
cd /path/to/zoom-integration

# Or create new directory
mkdir zoom-integration
cd zoom-integration
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `express` - Web framework
- `axios` - HTTP client
- `socket.io` - WebSocket support
- `cors` - Cross-origin resource sharing
- `helmet` - Security headers
- `morgan` - Request logging
- `dotenv` - Environment variables

### 3. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your preferred editor
```

Required variables:
```env
ZOOM_CLIENT_ID=your_client_id_here
ZOOM_CLIENT_SECRET=your_client_secret_here
ZOOM_ACCOUNT_ID=your_account_id_here
PORT=3000
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ZOOM_CLIENT_ID` | Your Zoom app Client ID | Yes | - |
| `ZOOM_CLIENT_SECRET` | Your Zoom app Client Secret | Yes | - |
| `ZOOM_ACCOUNT_ID` | Your Zoom Account ID | Yes | - |
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment (development/production) | No | development |
| `CORS_ORIGIN` | CORS allowed origins | No | * |

### Testing Variables (Optional)

For running test scripts:
```env
TEST_HOST_USER_ID=host@example.com
TEST_PARTICIPANT_USER_ID=participant@example.com
TEST_MEETING_ID=1234567890
```

## 🎮 Usage

### Starting the Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

Expected output:
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

### Running Tests

```bash
# Test token retrieval flow
npm test

# Or run directly
node examples/testTokenRetrieval.js
```

### HTTP API

#### 1. Start Meeting (Host)

```bash
curl -X POST http://localhost:3000/api/meetings/start \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "1234567890",
    "hostUserId": "host@example.com"
  }'
```

Response:
```json
{
  "success": true,
  "meetingId": "1234567890",
  "zakToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "2 hours",
  "message": "Meeting credentials generated successfully"
}
```

#### 2. Join Meeting (Participant)

```bash
curl -X POST http://localhost:3000/api/meetings/join \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "1234567890",
    "participantUserId": "participant@example.com"
  }'
```

Response:
```json
{
  "success": true,
  "meetingId": "1234567890",
  "obfToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "30 minutes",
  "message": "Join credentials generated successfully"
}
```

#### 3. Batch Join (Multiple Participants)

```bash
curl -X POST http://localhost:3000/api/meetings/batch-join \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "1234567890",
    "participantUserIds": [
      "user1@example.com",
      "user2@example.com",
      "user3@example.com"
    ]
  }'
```

#### 4. Complete Setup (Host + Participants)

```bash
curl -X POST http://localhost:3000/api/meetings/setup \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "1234567890",
    "hostUserId": "host@example.com",
    "participantUserIds": [
      "alice@example.com",
      "bob@example.com"
    ]
  }'
```

### WebSocket

#### Client Connection (JavaScript/Browser)

```javascript
// Import socket.io client
const socket = io('http://localhost:3000');

// Authenticate
socket.emit('authenticate', { userId: 'user@example.com' });

socket.on('authenticated', (data) => {
  console.log('Authenticated:', data);
});

// Host: Start meeting
socket.emit('meeting:start', {
  meetingId: '1234567890',
  hostUserId: 'host@example.com'
});

socket.on('meeting:started', (data) => {
  console.log('ZAK Token:', data.zakToken);
  // Use token to initialize Zoom Video SDK
});

// Participant: Join meeting
socket.emit('meeting:join', {
  meetingId: '1234567890',
  participantUserId: 'participant@example.com'
});

socket.on('meeting:credentials', (data) => {
  console.log('OBF Token:', data.obfToken);
  // Use token to join Zoom meeting
});
```

#### WebSocket Events

**Client → Server:**
- `authenticate` - Authenticate user
- `meeting:start` - Request ZAK token (host)
- `meeting:join` - Request OBF token (participant)
- `meeting:distribute` - Distribute tokens to multiple users (host)
- `ping` - Connection health check

**Server → Client:**
- `authenticated` - Authentication confirmation
- `meeting:started` - ZAK token delivery
- `meeting:credentials` - OBF token delivery
- `meeting:distributed` - Distribution status
- `error` - Error notification
- `pong` - Ping response

## 📚 API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information |
| GET | `/api/health` | Health check |
| POST | `/api/meetings/start` | Get ZAK token for host |
| POST | `/api/meetings/join` | Get OBF token for participant |
| POST | `/api/meetings/batch-join` | Get OBF tokens for multiple participants |
| POST | `/api/meetings/setup` | Get all tokens (ZAK + OBF) |

### Token Types

| Token | Purpose | Validity | Scope |
|-------|---------|----------|-------|
| **ZAK** | Host authentication | 2 hours | User-level |
| **OBF** | Participant authentication | 30 minutes | Meeting-specific |
| **Access** | API authentication | 1 hour | Internal (cached) |

## 💡 Examples

### Example 1: Simple Host Workflow

```javascript
const axios = require('axios');

async function startMeeting() {
  const response = await axios.post('http://localhost:3000/api/meetings/start', {
    meetingId: '1234567890',
    hostUserId: 'host@example.com'
  });
  
  const { zakToken } = response.data;
  // Use zakToken with Zoom Video SDK
  console.log('ZAK Token:', zakToken);
}

startMeeting();
```

### Example 2: Participant Joins

```javascript
async function joinMeeting() {
  const response = await axios.post('http://localhost:3000/api/meetings/join', {
    meetingId: '1234567890',
    participantUserId: 'participant@example.com'
  });
  
  const { obfToken } = response.data;
  // Use obfToken with Zoom Video SDK
  console.log('OBF Token:', obfToken);
}

joinMeeting();
```

### Example 3: Complete Meeting Setup

```javascript
async function setupCompleteMeeting() {
  const response = await axios.post('http://localhost:3000/api/meetings/setup', {
    meetingId: '1234567890',
    hostUserId: 'admin@example.com',
    participantUserIds: [
      'alice@example.com',
      'bob@example.com',
      'charlie@example.com'
    ]
  });
  
  // Distribute tokens to users
  const { host, participants } = response.data;
  
  // Send ZAK to host
  sendToHost(host.zakToken);
  
  // Send OBF to each participant
  participants.forEach(p => {
    sendToParticipant(p.userId, p.obfToken);
  });
}

setupCompleteMeeting();
```

## 🐛 Troubleshooting

### Issue: "OAuth authentication failed"

**Causes:**
- Invalid credentials in `.env`
- Zoom app not activated
- Missing required scopes

**Solutions:**
1. Verify credentials in Zoom Marketplace
2. Ensure app is activated
3. Add `user:read:admin` and `meeting:write:admin` scopes
4. Check `.env` file format (no quotes around values)

### Issue: "Failed to fetch OBF token"

**Causes:**
- Missing `meeting_id` parameter
- Invalid user ID
- User not authorized for meeting

**Solutions:**
1. Always provide `meeting_id` when requesting OBF tokens
2. Verify user IDs are correct Zoom user IDs or emails
3. Ensure user has permission to join the meeting

### Issue: "Connection refused" (WebSocket)

**Causes:**
- Server not running
- Firewall blocking connections
- Wrong port

**Solutions:**
1. Start server: `npm start`
2. Check firewall rules
3. Verify `PORT` in `.env` matches client connection URL

### Issue: Tokens expired

**Causes:**
- Natural token expiration (30 min - 2 hours)
- Clock skew

**Solutions:**
1. Request fresh tokens when needed (they're short-lived by design)
2. Implement token refresh logic in your client
3. Sync system clocks

## 📂 Project Structure

```
zoom-integration/
├── server.js                    # Main application
├── services/
│   └── zoomTokenService.js     # Token management logic
├── routes/
│   └── meetingRoutes.js        # HTTP API endpoints
├── websocket/
│   └── websocketHandler.js     # WebSocket event handlers
├── examples/
│   ├── testTokenRetrieval.js   # Test script
│   ├── httpClient.js           # HTTP client example
│   └── websocketClient.js      # WebSocket client example
├── package.json                 # Dependencies
├── .env.example                 # Environment template
└── README.md                    # This file
```

## 🔄 Integration with Your Repository

To integrate this system into your existing `zoom_app_webapp` repository:

### Option 1: Replace Backend

If your repo doesn't have a backend yet:
```bash
# In your repo root
mkdir backend
cp -r /path/to/zoom-integration/* backend/
cd backend
npm install
```

### Option 2: Merge with Existing Backend

If you have an existing Express app:
1. Copy `services/zoomTokenService.js` to your services folder
2. Copy `routes/meetingRoutes.js` to your routes folder
3. Copy `websocket/websocketHandler.js` if using WebSockets
4. Import and use in your main server file:

```javascript
const ZoomTokenService = require('./services/zoomTokenService');
const meetingRoutes = require('./routes/meetingRoutes');

const zoomService = new ZoomTokenService(config);
app.locals.zoomService = zoomService;
app.use('/api', meetingRoutes);
```

## 📖 Additional Resources

- [Zoom Video SDK Documentation](https://developers.zoom.us/docs/video-sdk/)
- [Server-to-Server OAuth Guide](https://developers.zoom.us/docs/internal-apps/s2s-oauth/)
- [ZAK Token Documentation](https://developers.zoom.us/docs/video-sdk/auth/#use-a-zoom-access-key-zak)
- [March 2, 2026 Compliance Info](https://developers.zoom.us/docs/video-sdk/auth/)

## 📄 License

MIT

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

---

**Need help?** Open an issue or contact your Zoom Developer representative.
