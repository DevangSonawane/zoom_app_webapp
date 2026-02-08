# Zoom Token Distribution (Firebase Functions)

> Located at `backend/functions`

Firebase Cloud Functions backend that handles Zoom **OAuth** authorization and distributes **ZAK/OBF tokens** for the Zoom Video SDK.

## How it works

1. A user (via Flutter) signs in with Firebase Auth and gets a Firebase ID token.
2. The user connects their Zoom account via the OAuth consent flow (one-time).
3. When a meeting is needed, the user requests ZAK or OBF tokens from this API.
4. The backend uses the stored refresh token to get a fresh Zoom access token, then fetches ZAK/OBF from the Zoom API.

## Prerequisites

1. Firebase project with **Authentication**, **Firestore**, and **Functions** enabled.
2. A **Zoom OAuth app** (not Server-to-Server) in the Zoom App Marketplace with scopes:
   - `user:read:admin`
   - `meeting:write:admin`
3. The OAuth app's redirect URI must point to the callback endpoint (see below).

## Environment variables

### Local development (`backend/functions/.env`)

```
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
ZOOM_REDIRECT_URI=http://localhost:5001/<PROJECT_ID>/us-central1/zoomApi/api/auth/zoom/callback
```

### Production (Firebase config)

```bash
firebase functions:config:set \
  zoom.client_id="YOUR_CLIENT_ID" \
  zoom.client_secret="YOUR_CLIENT_SECRET" \
  zoom.redirect_uri="https://us-central1-<PROJECT_ID>.cloudfunctions.net/zoomApi/api/auth/zoom/callback"
```

### Optional

- `ZOOM_AUTHORIZED_DOMAINS` -- comma-separated email domains. If set, only Firebase users with matching emails can call the API.

## API Reference

All endpoints (except `/api/health`) require `Authorization: Bearer <Firebase ID Token>`.

### Zoom OAuth

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/zoom/url` | GET | Returns the Zoom OAuth consent URL |
| `/api/auth/zoom/callback` | POST | Exchanges auth code for tokens. Body: `{ "code": "..." }` |
| `/api/auth/zoom/status` | GET | Check if user's Zoom account is connected |
| `/api/auth/zoom/disconnect` | POST | Remove stored Zoom tokens |

### Meeting Tokens

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check (no auth required) |
| `/api/meetings/start` | POST | Issue ZAK token for the authenticated user |
| `/api/meetings/join` | POST | Issue OBF token for the authenticated user |
| `/api/meetings/batch-join` | POST | Issue OBF tokens for multiple users |
| `/api/meetings/setup` | POST | Combined host ZAK + participant OBF tokens |

### Request/Response Examples

**Connect Zoom account (step 1 -- get URL):**
```bash
curl -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  https://.../zoomApi/api/auth/zoom/url
```
```json
{ "url": "https://zoom.us/oauth/authorize?response_type=code&client_id=...&state=..." }
```

**Connect Zoom account (step 2 -- after user authorizes, send the code):**
```bash
curl -X POST -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"code":"auth_code_from_zoom"}' \
  https://.../zoomApi/api/auth/zoom/callback
```
```json
{ "success": true, "message": "Zoom account connected", "zoomUserId": "..." }
```

**Start meeting (get ZAK token):**
```bash
curl -X POST -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"123456789"}' \
  https://.../zoomApi/api/meetings/start
```
```json
{ "meetingId": "123456789", "host": "zoom_user_id", "zakToken": "eyJ..." }
```

**Join meeting (get OBF token):**
```bash
curl -X POST -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"123456789"}' \
  https://.../zoomApi/api/meetings/join
```
```json
{ "meetingId": "123456789", "participant": "zoom_user_id", "obfToken": "eyJ..." }
```

## Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `zoomTokens/{firebaseUid}` | Per-user Zoom OAuth tokens (accessToken, refreshToken, expiry, zoomUserId) |
| `zoomMeetings/{meetingId}` | Meeting metadata and token issuance logs |

## OAuth Flow Diagram

```
Flutter App                     Backend (Cloud Functions)              Zoom
-----------                     ------------------------              ----
    |                                    |                              |
    |-- GET /auth/zoom/url ------------->|                              |
    |<-- { url } ------------------------|                              |
    |                                    |                              |
    |-- Open URL in browser -------------|----------------------------->|
    |                                    |       User logs in & grants  |
    |<-- Redirect with ?code=xxx --------|<-----------------------------|
    |                                    |                              |
    |-- POST /auth/zoom/callback ------->|                              |
    |   { code: "xxx" }                  |-- exchange code for tokens ->|
    |                                    |<-- access + refresh token ---|
    |                                    |-- store in Firestore         |
    |<-- { success, zoomUserId } --------|                              |
    |                                    |                              |
    |   (later, when meeting needed)     |                              |
    |                                    |                              |
    |-- POST /meetings/start ----------->|                              |
    |   { meetingId }                    |-- use refresh token -------->|
    |                                    |<-- access token -------------|
    |                                    |-- GET /users/{id}/token ---->|
    |                                    |<-- ZAK token ----------------|
    |<-- { zakToken } -------------------|                              |
```

## Deployment

```bash
firebase deploy --only functions
```

Monitor logs:
```bash
firebase functions:log --only zoomApi
```

## Local Development

```bash
cd backend/functions
npm install
cp .env.example .env  # fill in credentials + redirect URI

# From project root:
firebase emulators:start --only auth,firestore,functions
```

See the root [README](../../README.md) for project-wide setup and [Flutter integration guide](../docs/flutter-integration.md) for client-side usage.
