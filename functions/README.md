# Zoom token distribution (Firebase Functions)

This module adapts the Zoom token distribution system for Firebase Cloud Functions so the existing pre‑built ZoomTokenService can run safely inside your Firestore/Functions stack.

## What’s here
- **ZoomTokenService** (`src/services/zoomTokenService.ts`): performs Zoom Server-to-Server OAuth, caches the bearer token in Firestore (`zoom/tokenCache`), and issues ZAK/OBF tokens for hosts and participants.  
- **`zoomApi` Express router** (`src/index.ts`): exposes `/api/meetings/start`, `/join`, `/batch-join`, `/setup` behind Firebase Auth, logs failures via `functions.logger`, and records metadata in `zoomMeetings/{meetingId}`.  
- **Local dotenv support**: `src/index.ts` imports `dotenv/config` so `functions/.env` works with emulators.

## Prerequisites
1. Firebase project with Firestore, Authentication, and Functions enabled (Node 18+).  
2. Zoom Server-to-Server OAuth app with scopes listed in `zoom-integration/README.md`.  
3. Firebase Admin service account (handled via `firebase-admin` default credentials in Functions).

## Environment configuration

### Firebase config (production)
Run:
```bash
firebase functions:config:set zoom.client_id="ZOOM_CLIENT_ID" \
  zoom.client_secret="ZOOM_CLIENT_SECRET" \
  zoom.account_id="ZOOM_ACCOUNT_ID"
```
`functions/src/index.ts` will also read `functions:config` values such as `zoom.client_id`, `zoom.client_secret`, and `zoom.account_id`.

### Local development (`firebase emulators:start`)
Create `functions/.env` with:
```
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_ACCOUNT_ID=...
ZOOM_AUTHORIZED_DOMAINS=example.com,acme.org  # optional, comma separated decision gate
```
`dotenv` loads these values before Express runs so the emulator sees the credentials even without `firebase functions:config:set`.

### Optional controls
- `ZOOM_AUTHORIZED_DOMAINS`: if set, only Firebase users whose emails match one of the domains can call the API.  
- `functions.config().version`: the `/api/health` endpoint surfaces this (helpful for builds/deployments).

## API overview
All endpoints require `Authorization: Bearer <Firebase ID token>`.

| Endpoint | Purpose | Input | Output |
| --- | --- | --- | --- |
| `POST /api/meetings/start` | Issue host ZAK token | `meetingId`, `hostZoomUserId` (defaults to auth email/UID) | `{ meetingId, host, zakToken }` |
| `POST /api/meetings/join` | Issue participant OBF token | `meetingId`, `participantZoomUserId` (defaults to auth email/UID) | `{ meetingId, participant, obfToken }` |
| `POST /api/meetings/batch-join` | Issue multiple OBF tokens | `meetingId`, `participants: string[]` | `tokensIssued`, lists of successes/failures |
| `POST /api/meetings/setup` | Combined host + optional participants | `meetingId`, `hostZoomUserId`, `participantZoomUserIds[]` | Serialized tokens (host + participants) |

Each request logs success/failure via `functions.logger` (tagged `zoomApi`) and persists metadata under `zoomMeetings/{meetingId}` using `storeMeetingMetadata`.

## Firestore metadata
`storeMeetingMetadata` writes:
```json
{
  "requestedBy": "<uid>",
  "requestedByEmail": "<email|null>",
  "updatedAt": <serverTimestamp>,
  ...
}
```
Extend the `metadata` payload to include `hostZoomUserId`, `lastZakIssuedAt`, `batchParticipants`, etc. Guard reads/writes via Firestore security rules if needed.

## Authentication
The Express middleware:
1. Extracts `Authorization` header, verifies the ID token via `admin.auth().verifyIdToken`.
2. Optionally enforces `ZOOM_AUTHORIZED_DOMAINS`.
3. Attaches `req.user` for metadata logging.

## Token caching
- Access tokens are cached in memory while the invocation lives.  
- If Firestore caching is enabled (`enableFirestoreCache`), tokens are persisted under `zoom/tokenCache` and reused across cold starts (with a 5‑minute safety buffer).  
- Manually clear cache via `zoomService.clearCache()` (useful during tests).

## Flutter integration
1. Sign in users with Firebase Auth.  
2. Fetch an ID token:
   ```dart
   final idToken = await FirebaseAuth.instance.currentUser!.getIdToken();
   ```
3. Call the desired endpoint using `Authorization: Bearer <idToken>` and pass `meetingId`/`hostZoomUserId`/`participantZoomUserId`.  
4. Initialize Zoom Video SDK with the returned `zakToken`/`obfToken`.
5. For Realtime updates, you can also listen to `zoomMeetings/{meetingId}` documents from Flutter.

## Testing (local or deployed)
```bash
curl -X POST https://us-central1-<PROJECT>.cloudfunctions.net/zoomApi/api/meetings/start \
  -H "Authorization: Bearer <idToken>" \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"123456789","hostZoomUserId":"host@company.com"}'
```
Replace `/join` or `/batch-join` as needed and include participant arrays.

## Deployment
```bash
cd functions
npm run build
firebase deploy --only functions
```
Use `firebase functions:log --only zoomApi` or the Cloud Console logs to monitor the `zoomApi` function.

## OAuth redirect helper
`script.py` (root) runs a lightweight HTTP server at port 3000 that forwards Zoom OAuth callbacks to `zoomtest://oauth` (useful for Flutter deep links during PKCE flows). Run it alongside your emulator if you rely on Zoom’s OAuth redirect URI.

## Monitoring & optional policies
- Export logs to BigQuery for analytics (each invocation logs the meeting ID, endpoint, and `zoomApi` tag).  
- Implement per-UID rate limiting by incrementing counters in Firestore before calling Zoom (e.g., `zoomRateLimits/{uid}`) or integrate App Check/Cloud Armor.  
- Use Firestore/Realtime Database listeners instead of websockets; clients can watch `zoomMeetings/{meetingId}` for fresh tokens rather than relying on persistent connections.

Let me know if you want a separate README for Flutter integration or Firestore security rules for `zoomMeetings`.    	
