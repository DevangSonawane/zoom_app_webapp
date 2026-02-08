# Zoom App Webapp

Backend API for **Zoom Video SDK** integration with a Flutter app. Handles user management (Firebase) and Zoom token distribution (ZAK + OBF) via OAuth.

---

## Folder Structure

```
zoom_app_webapp/
├── frontend/                         # React admin panel (user creation)
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminPage.jsx         #   Create users in Firebase
│   │   │   └── AuthCallback.jsx      #   OAuth test stub
│   │   └── firebase/config.js        #   Firebase client config
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   └── functions/                    # Firebase Cloud Functions (JavaScript)
│       ├── index.js                  #   Express app -- all API endpoints
│       ├── services/
│       │   └── zoomTokenService.js   #   Zoom OAuth + ZAK/OBF token logic
│       ├── .env                      #   Credentials (gitignored)
│       ├── .env.example              #   Template
│       └── package.json
│
├── firebase.json                     # Firebase Hosting + Functions config
├── .gitignore
└── README.md                         # This file
```

---

## How It Works (Complete Flow)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ONE-TIME SETUP                              │
│                                                                     │
│  1. Admin creates user accounts via the React frontend              │
│     (Firebase Auth + Firestore "users" collection)                  │
│                                                                     │
│  2. Each user connects their Zoom account (OAuth consent)           │
│     - Flutter calls GET /api/auth/zoom/url                          │
│     - Opens the returned URL in a browser                           │
│     - User logs into Zoom and approves                              │
│     - Zoom redirects to GET /api/auth/zoom/callback?code=xxx       │
│     - Backend exchanges code for tokens, stores in Firestore        │
│     - Browser redirects to zoomtest://oauth (back to Flutter)       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      EVERY MEETING                                  │
│                                                                     │
│  Host wants to start a meeting:                                     │
│     Flutter calls POST /api/meetings/start { meetingId }            │
│     → Backend fetches ZAK token from Zoom API                       │
│     → Returns { zakToken } to Flutter                               │
│     → Flutter passes ZAK to Zoom Video SDK to start meeting         │
│                                                                     │
│  Participant wants to join:                                         │
│     Flutter calls POST /api/meetings/join { meetingId }             │
│     → Backend fetches OBF token from Zoom API                       │
│     → Returns { obfToken } to Flutter                               │
│     → Flutter passes OBF to Zoom Video SDK to join meeting          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Setup

### 1. Install

```bash
cd backend/functions
npm install
```

### 2. Configure `.env`

```bash
cp .env.example .env
```

Fill in:

```env
ZOOM_CLIENT_ID=GN1XDY33R_uSm6211ZQ9rw
ZOOM_CLIENT_SECRET=jNQ4SqI0qgBPmlmtK1a0m2fYR2y4qDtG
ZOOM_REDIRECT_URI=<see below>
```

**Redirect URI values:**

| Environment | ZOOM_REDIRECT_URI |
|------------|-------------------|
| Local emulator | `http://localhost:5001/<PROJECT_ID>/us-central1/zoomApi/api/auth/zoom/callback` |
| Production | `https://us-central1-zoomappplatform.cloudfunctions.net/zoomApi/api/auth/zoom/callback` |

**Important:** Whichever URI you use must also be added to the **OAuth Allow List** in the Zoom App Marketplace. Current allow list from the Zoom app:

```
http://localhost:3000/auth/callback
http://192.168.1.17:3000/auth/callback
http://192.168.0.105:3000/auth/callback
http://10.0.2.2:3000/auth/callback
https://sselectronics.asynk.in/auth-callback
https://zoomtest.example.com/oauth
```

You need to **add your Cloud Functions callback URL** to this list.

### 3. Run locally

```bash
firebase login
firebase use zoomappplatform
firebase emulators:start --only auth,firestore,functions
```

Base URL: `http://127.0.0.1:5001/zoomappplatform/us-central1/zoomApi`

### 4. Deploy

```bash
firebase deploy --only functions
```

Production base URL: `https://us-central1-zoomappplatform.cloudfunctions.net/zoomApi`

---

## API Reference

**Base URL:**
- Local: `http://127.0.0.1:5001/<PROJECT>/us-central1/zoomApi`
- Production: `https://us-central1-zoomappplatform.cloudfunctions.net/zoomApi`

All endpoints (except health and GET callback) require:
```
Authorization: Bearer <Firebase ID Token>
```

---

### Health Check

```
GET /api/health
```

No auth required.

**Response:**
```json
{ "status": "ok", "timestamp": "2026-02-08T..." }
```

---

### Zoom OAuth -- Connect Account

#### Step 1: Get the consent URL

```
GET /api/auth/zoom/url
Authorization: Bearer <Firebase ID Token>
```

Optional query param: `?code_challenge=xxx` (for PKCE)

**Response:**
```json
{
  "url": "https://zoom.us/oauth/authorize?response_type=code&client_id=GN1XDY33R_uSm6211ZQ9rw&redirect_uri=...&state=<firebaseUid>",
  "state": "firebase_uid_here"
}
```

Flutter opens this URL in a browser. User logs into Zoom and approves.

#### Step 2a: Browser callback (automatic)

```
GET /api/auth/zoom/callback?code=xxx&state=<firebaseUid>
```

No auth header needed -- Zoom redirects the browser here directly. Backend exchanges the code, stores tokens in Firestore, and redirects to:

```
zoomtest://oauth?success=true&zoom_user_id=xxx
```

Flutter catches this deep link and knows the account is connected.

#### Step 2b: Manual callback (from Flutter)

If Flutter intercepts the code itself (e.g. via deep link), it can send it directly:

```
POST /api/auth/zoom/callback
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json

{ "code": "authorization_code_from_zoom" }
```

**Response:**
```json
{ "success": true, "message": "Zoom account connected", "zoomUserId": "xxx" }
```

---

### Zoom OAuth -- Status & Disconnect

#### Check connection status

```
GET /api/auth/zoom/status
Authorization: Bearer <Firebase ID Token>
```

**Response (connected):**
```json
{ "connected": true, "zoomUserId": "abc123" }
```

**Response (not connected):**
```json
{ "connected": false }
```

#### Disconnect Zoom account

```
POST /api/auth/zoom/disconnect
Authorization: Bearer <Firebase ID Token>
```

**Response:**
```json
{ "success": true, "message": "Zoom account disconnected" }
```

---

### Meeting Tokens

All meeting endpoints require the user to have connected their Zoom account first.

#### Start Meeting (ZAK token for host)

```
POST /api/meetings/start
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json

{ "meetingId": "123456789" }
```

**Response:**
```json
{
  "meetingId": "123456789",
  "host": "zoom_user_id",
  "zakToken": "eyJhbGci..."
}
```

ZAK token is valid for **2 hours**.

#### Join Meeting (OBF token for participant)

```
POST /api/meetings/join
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json

{ "meetingId": "123456789" }
```

**Response:**
```json
{
  "meetingId": "123456789",
  "participant": "zoom_user_id",
  "obfToken": "eyJhbGci..."
}
```

OBF token is valid for **30 minutes** and is scoped to that specific meeting.

#### Batch Join (OBF tokens for multiple users)

```
POST /api/meetings/batch-join
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json

{
  "meetingId": "123456789",
  "participants": ["firebase_uid_1", "firebase_uid_2", "firebase_uid_3"]
}
```

**Response:**
```json
{
  "meetingId": "123456789",
  "tokensIssued": 2,
  "successful": [
    { "userId": "zoom_user_1", "firebaseUid": "firebase_uid_1", "obfToken": "eyJ..." },
    { "userId": "zoom_user_2", "firebaseUid": "firebase_uid_2", "obfToken": "eyJ..." }
  ],
  "failed": [
    { "userId": "firebase_uid_3", "firebaseUid": "firebase_uid_3", "error": "Zoom account not connected..." }
  ]
}
```

#### Full Meeting Setup (host ZAK + participant OBF in one call)

```
POST /api/meetings/setup
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json

{
  "meetingId": "123456789",
  "hostFirebaseUid": "host_firebase_uid",
  "participantFirebaseUids": ["uid_1", "uid_2"]
}
```

**Response:**
```json
{
  "host": { "userId": "host_zoom_id", "zakToken": "eyJ..." },
  "participants": [
    { "userId": "zoom_user_1", "obfToken": "eyJ..." },
    { "userId": "zoom_user_2", "obfToken": "eyJ..." }
  ],
  "failed": [],
  "meetingId": "123456789",
  "timestamp": "2026-02-08T..."
}
```

---

## Flutter Integration (Quick Reference)

### 1. Sign in with Firebase

```dart
final idToken = await FirebaseAuth.instance.currentUser!.getIdToken();
```

### 2. Connect Zoom account (one-time)

```dart
// Get the OAuth URL
final res = await http.get(
  Uri.parse('$baseUrl/api/auth/zoom/url'),
  headers: {'Authorization': 'Bearer $idToken'},
);
final url = jsonDecode(res.body)['url'];

// Open in browser -- user approves -- deep link brings them back
await launchUrl(Uri.parse(url));
```

### 3. Get tokens for meetings

```dart
// Host: get ZAK
final res = await http.post(
  Uri.parse('$baseUrl/api/meetings/start'),
  headers: {
    'Authorization': 'Bearer $idToken',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({'meetingId': meetingId}),
);
final zakToken = jsonDecode(res.body)['zakToken'];

// Participant: get OBF
final res2 = await http.post(
  Uri.parse('$baseUrl/api/meetings/join'),
  headers: {
    'Authorization': 'Bearer $idToken',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({'meetingId': meetingId}),
);
final obfToken = jsonDecode(res2.body)['obfToken'];
```

### 4. Pass to Zoom SDK

```kotlin
// Android -- Host
params.zoomAccessToken = zakToken

// Android -- Participant
params.onBehalfToken = obfToken
```

---

## Firestore Collections

| Collection | Documents | Purpose |
|-----------|-----------|---------|
| `users` | `{autoId}` | User profiles (fullName, displayName, email, uid) -- written by admin frontend |
| `zoomTokens` | `{firebaseUid}` | Per-user Zoom OAuth tokens (accessToken, refreshToken, expiry, zoomUserId) |
| `zoomMeetings` | `{meetingId}` | Meeting metadata and token issuance logs |

---

## Environment Variables

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `ZOOM_CLIENT_ID` | `backend/functions/.env` | Yes | From Zoom App Marketplace |
| `ZOOM_CLIENT_SECRET` | `backend/functions/.env` | Yes | From Zoom App Marketplace |
| `ZOOM_REDIRECT_URI` | `backend/functions/.env` | Yes | Must match Zoom app's Allow List |
| `ZOOM_APP_DEEP_LINK` | `backend/functions/.env` | No | Deep link scheme (default: `zoomtest://oauth`) |
| `ZOOM_AUTHORIZED_DOMAINS` | `backend/functions/.env` | No | Restrict by email domain |

---

## Token Lifetimes

| Token | Validity | Notes |
|-------|----------|-------|
| Zoom OAuth access token | 1 hour | Auto-refreshed by backend |
| Zoom OAuth refresh token | Long-lived | Stored in Firestore, may rotate |
| ZAK token | 2 hours | Per-user, not meeting-specific |
| OBF token | 30 minutes | Per-user AND per-meeting |
| Firebase ID token | 1 hour | Flutter refreshes via `getIdToken()` |
