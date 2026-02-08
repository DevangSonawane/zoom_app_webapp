# Flutter Integration Guide

This document describes how the pre-built Flutter frontend connects to the Zoom Token Distribution backend that lives in this repository (the Firebase Functions module and the `zoom-integration` server). Follow these steps to wire up authentication, token requests, and real-time state updates from Flutter.

## What you already have
- **Flutter UI**: A ready-to-use frontend whose responsibilities are signing in admins/participants, requesting tokens, and passing them to the Zoom Video SDK.
- **Firebase + Functions backend**: Exposes `/api/meetings/start`, `/join`, `/batch-join`, and `/setup` endpoints inside `backend/functions/src/index.ts` (see `backend/functions/README.md`).
- **Optional Node server**: The `backend/zoom-integration` folder can also serve tokens over HTTP or WebSocket if you need a standalone service.

## Prerequisites
1. **Flutter toolchain** (latest stable). Your Flutter project should include `firebase_core`, `firebase_auth`, `cloud_firestore`, and `http` (or another HTTP client).
2. **Firebase project** with Authentication, Firestore, and Cloud Functions enabled.
3. **Zoom Server-to-Server OAuth app** (scopes: `user:read:admin`, `meeting:write:admin`). Store `client_id`, `client_secret`, and `account_id` in Functions config or `.env`.
4. **Firebase configuration files** (`GoogleService-Info.plist` for iOS/macOS, `google-services.json` for Android) copied into the Flutter project.
5. **Deep link URI** `zoomtest://oauth` registered in Android/iOS so the PKCE redirect helper can hand the code back to Flutter.

## Flutter setup outline
1. Add dependencies (example `pubspec.yaml` snippet):
   ```yaml
   dependencies:
     flutter:
       sdk: flutter
     firebase_core: ^2.12.0
     firebase_auth: ^4.6.0
     cloud_firestore: ^4.6.0
     http: ^1.2.0
     flutter_dotenv: ^5.0.0  # optional for local dev configs
   ```
2. Initialize Firebase before using auth/firestore:
   ```dart
   await Firebase.initializeApp();
   ```
3. Sign in an admin user (email/password, Google, etc.).
4. Exchange the signed-in user for an ID token:
   ```dart
   final idToken = await FirebaseAuth.instance.currentUser!.getIdToken();
   ```
5. Call the Function endpoint with `Authorization: Bearer <idToken>`.

## Calling the backend
Use the hosted Firebase Function URL (`https://<region>-<project>.cloudfunctions.net/zoomApi`) or your emulator URL when testing (`http://localhost:5001/<project>/<region>/zoomApi`).

### Example Dart request
```dart
final response = await http.post(
  Uri.parse('https://<project>.cloudfunctions.net/zoomApi/api/meetings/start'),
  headers: {
    'Authorization': 'Bearer $idToken',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'meetingId': meetingId,
    'hostZoomUserId': hostEmail, // optional
  }),
);
final data = jsonDecode(response.body);
final zakToken = data['zakToken'];
```
Repeat for `/join` or `/batch-join` by adjusting the payload.

### Available endpoints (see `backend/functions/README.md`)
- `POST /api/meetings/start` -- returns host ZAK token
- `POST /api/meetings/join` -- returns participant OBF token
- `POST /api/meetings/batch-join` -- bulk OBF issuance
- `POST /api/meetings/setup` -- combined start/join flow with metadata

All responses include `meetingId` plus the issued tokens. Check for HTTP 401/403 if the ID token cannot be verified.

## Real-time sync
Listen to Firestore documents under `zoomMeetings/{meetingId}` to react to metadata changes, token refreshes, or batch status updates.
```dart
final doc = FirebaseFirestore.instance.collection('zoomMeetings').doc(meetingId);
doc.snapshots().listen((snapshot) {
  final metadata = snapshot.data();
  // Use `metadata['zakTokenIssuedAt']` or similar fields if your Flutter UI shows status
});
```
Make sure Firestore security rules align with your access model (admin vs. participant). The rules should mirror the restrictions applied in `backend/functions/src/index.ts`.

## Local development
1. Run Firebase emulators:
   ```bash
   firebase emulators:start --only auth,firestore,functions
   ```
2. Point Flutter to the emulator URL for functions (look in `firebase.json` for host/port). Usually:
   `http://localhost:5001/<project>/<region>/zoomApi/api/...`
3. Keep `scripts/zoom_oauth_redirect.py` running if your Flutter app uses the Zoom OAuth PKCE flow; it listens on port 3000 and redirects Zoom's callback to `zoomtest://oauth`:
   ```bash
   python3 scripts/zoom_oauth_redirect.py
   ```
   - Use `http://localhost:3000/auth/callback` as the Zoom redirect URI while testing.
   - For Android emulator use `http://10.0.2.2:3000/auth/callback`, for physical devices use `http://<your-ip>:3000/auth/callback`.

## Mixing with the Node.js `zoom-integration` server
If you prefer or need the standalone `backend/zoom-integration` server instead of Firebase Functions:
- Run `npm install` inside `backend/zoom-integration` and set `.env` with Zoom credentials.
- Point Flutter at `http://<host>:<port>/api/meetings...` and supply the same Firebase ID token (the Node server reuses the Firebase Auth verification logic).
- Use the WebSocket route (`/socket.io`) if your Flutter client benefits from real-time token delivery.

## Troubleshooting
- If you get `401 Unauthorized`, confirm Firebase Auth ID token is fresh (call `getIdToken(true)` to force refresh).
- Logs appear in the Firebase emulator UI or `firebase functions:log --only zoomApi`.
- Tokens expire quickly; always reinitialize the Zoom SDK with the latest ZAK/OBF.
- Inspect Firestore's `zoomMeetings` document for metadata when a call fails.

## References
- Firebase Functions API: `backend/functions/README.md`
- Zoom Server-to-Server helper: `backend/zoom-integration/README.md`
- OAuth redirect helper: `scripts/zoom_oauth_redirect.py`
- Project overview: [README](../../README.md)
