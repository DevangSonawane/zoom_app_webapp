# Zoom Token Distribution - Visual Workflow

## 🔄 Complete Token Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                                 │
└─────────────────────────────────────────────────────────────────────┘
         │                                      │
         │ Host starts meeting                  │ Participant joins
         │                                      │
         ▼                                      ▼
┌────────────────────┐              ┌────────────────────┐
│  Frontend Client   │              │  Frontend Client   │
│   (Host View)      │              │ (Participant View) │
└─────────┬──────────┘              └─────────┬──────────┘
          │                                   │
          │ 1. Request ZAK                    │ 4. Request OBF
          │                                   │
          ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND SERVER (Node.js)                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              2. Check Access Token Cache                      │  │
│  │                                                               │  │
│  │  if (cached && valid) {                                      │  │
│  │    return cached_token                                       │  │
│  │  } else {                                                    │  │
│  │    fetch_new_token_from_zoom()                               │  │
│  │  }                                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │         3. Fetch ZAK Token          5. Fetch OBF Token       │  │
│  │                                                               │  │
│  │  GET /users/{hostId}/token          GET /users/{userId}/token│  │
│  │    ?type=zak                           ?type=onbehalf       │  │
│  │                                        &meeting_id={id}      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                         │                │
└──────────────────────────┼─────────────────────────┼────────────────┘
                           │                         │
                           │ HTTPS                   │ HTTPS
                           ▼                         ▼
        ┌─────────────────────────────────────────────────────────┐
        │              ZOOM API PLATFORM                          │
        │  https://api.zoom.us/v2                                │
        │                                                         │
        │  1. POST /oauth/token (Server-to-Server OAuth)        │
        │     → Returns: access_token (1 hour)                  │
        │                                                         │
        │  2. GET /users/{userId}/token?type=zak                │
        │     → Returns: ZAK token (2 hours)                    │
        │                                                         │
        │  3. GET /users/{userId}/token?type=onbehalf           │
        │              &meeting_id={meetingId}                   │
        │     → Returns: OBF token (30 minutes)                 │
        └─────────────────────────────────────────────────────────┘
                           │                         │
                           │ Response                │ Response
                           ▼                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND SERVER (Node.js)                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  6. Distribute Tokens                                        │  │
│  │                                                               │  │
│  │  • WebSocket: emit('meeting:started', {zakToken})           │  │
│  │  • WebSocket: emit('meeting:credentials', {obfToken})       │  │
│  │  • HTTP: Return JSON response                                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                           │                         │
                           ▼                         ▼
        ┌──────────────────────┐        ┌──────────────────────┐
        │  Frontend Client     │        │  Frontend Client     │
        │   (Host View)        │        │ (Participant View)   │
        │                      │        │                      │
        │  7. Initialize Zoom  │        │  8. Join Zoom        │
        │     Video SDK        │        │     Video SDK        │
        │     with ZAK token   │        │     with OBF token   │
        └──────────────────────┘        └──────────────────────┘
                           │                         │
                           ▼                         ▼
        ┌─────────────────────────────────────────────────────────┐
        │              ZOOM VIDEO SDK SESSION                     │
        │         (Video/Audio Communication)                      │
        └─────────────────────────────────────────────────────────┘
```

## 📊 Token Lifecycle

```
ACCESS TOKEN (Server-to-Server OAuth)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creation:  POST /oauth/token
           Authorization: Basic base64(clientId:clientSecret)
           Body: grant_type=account_credentials&account_id=XXX

Validity:  1 hour (3600 seconds)

Caching:   In-memory cache with 55-minute TTL (5-min buffer)

Usage:     Internal - Used to authenticate API requests
           Header: Authorization: Bearer {access_token}

Refresh:   Automatic when cache expires



ZAK TOKEN (Zoom Access Key - Host)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creation:  GET /users/{userId}/token?type=zak
           Authorization: Bearer {access_token}

Validity:  2 hours (7200 seconds)

Caching:   Optional in-memory cache with 115-minute TTL

Purpose:   Host authentication for starting/joining meetings

Usage:     Passed to Zoom Video SDK client.join()
           {
             topic: meetingId,
             token: zakToken,  ← Here
             userName: 'Host Name'
           }

Scope:     User-level (not meeting-specific)



OBF TOKEN (On Behalf Of - Participant)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creation:  GET /users/{userId}/token?type=onbehalf&meeting_id={meetingId}
           Authorization: Bearer {access_token}

Validity:  30 minutes (1800 seconds)

Caching:   NOT recommended (short TTL, meeting-specific)

Purpose:   Participant authentication for joining specific meetings

Usage:     Passed to Zoom Video SDK client.join()
           {
             topic: meetingId,
             token: obfToken,  ← Here
             userName: 'Participant Name'
           }

Scope:     Meeting-specific (cannot be reused for other meetings)

⚠️ Note:  meeting_id parameter is MANDATORY for compliance
```

## 🔑 Authentication Sequence

```
STEP 1: Server Startup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Server loads .env variables
  ↓
  Validates ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_ACCOUNT_ID
  ↓
  Creates ZoomTokenService instance
  ↓
  Tests OAuth connection by fetching access_token
  ↓
  Server ready to handle requests


STEP 2: Host Starts Meeting
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Frontend:  POST /api/meetings/start
             Body: {meetingId, hostUserId}
  ↓
  Backend:   zoomService.getAccessToken()
             ├─ Check cache
             ├─ If expired/missing:
             │  └─ POST /oauth/token → access_token
             └─ Return cached/fresh token
  ↓
  Backend:   zoomService.getZAKToken(hostUserId)
             └─ GET /users/{hostUserId}/token?type=zak
                Headers: Authorization: Bearer {access_token}
  ↓
  Backend:   Return response
             {success: true, zakToken: "...", expiresIn: "2 hours"}
  ↓
  Frontend:  Receives ZAK token
             └─ Initialize Zoom Video SDK
                client.join({token: zakToken, ...})


STEP 3: Participant Joins Meeting
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Frontend:  POST /api/meetings/join
             Body: {meetingId, participantUserId}
  ↓
  Backend:   zoomService.getAccessToken()
             └─ Return cached token (still valid from Step 2)
  ↓
  Backend:   zoomService.getOBFToken(participantUserId, meetingId)
             └─ GET /users/{participantUserId}/token
                  ?type=onbehalf&meeting_id={meetingId}
                Headers: Authorization: Bearer {access_token}
  ↓
  Backend:   Return response
             {success: true, obfToken: "...", expiresIn: "30 minutes"}
  ↓
  Frontend:  Receives OBF token
             └─ Join Zoom meeting
                client.join({token: obfToken, ...})


STEP 4: Multiple Participants (Batch)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Frontend:  POST /api/meetings/batch-join
             Body: {
               meetingId,
               participantUserIds: [user1, user2, user3, ...]
             }
  ↓
  Backend:   For each participant (parallel):
             └─ getOBFToken(userId, meetingId)
  ↓
  Backend:   Collect all results
             └─ {successful: [...], failed: [...]}
  ↓
  Frontend:  Distribute tokens to participants
             └─ Each participant joins with their OBF token
```

## ⏱️ Token Timing

```
TIME (minutes)    ACCESS TOKEN    ZAK TOKEN    OBF TOKEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0                 ✅ Valid        ✅ Valid     ✅ Valid
15                ✅ Valid        ✅ Valid     ✅ Valid
30                ✅ Valid        ✅ Valid     ❌ EXPIRED
45                ✅ Valid        ✅ Valid     [regenerate]
60 (1 hour)       ❌ EXPIRED      ✅ Valid     [regenerate]
75                [regenerate]    ✅ Valid     [regenerate]
90                [regenerate]    ✅ Valid     [regenerate]
105               [regenerate]    ✅ Valid     [regenerate]
120 (2 hours)     [regenerate]    ❌ EXPIRED   [regenerate]

Legend:
✅ Valid         - Token is active and usable
❌ EXPIRED       - Token has expired, must fetch new one
[regenerate]     - Must fetch fresh token on-demand

Notes:
• Access tokens cached with 55-min TTL (auto-refresh at 55 min)
• ZAK tokens valid for 2 hours (can be cached)
• OBF tokens valid for 30 minutes (fetch fresh for each user)
• All tokens are JWT-based and cannot be refreshed, only re-issued
```

## 🔄 WebSocket vs HTTP Comparison

```
┌─────────────────────────────────────────────────────────────┐
│                    WEBSOCKET FLOW                            │
└─────────────────────────────────────────────────────────────┘

Client                                   Server
  │                                        │
  ├─ connect ──────────────────────────────>│
  │                                        │
  │<─────────────────────── 'connected' ─ ─┤
  │                                        │
  ├─ emit('authenticate') ─────────────────>│
  │    {userId: 'host@ex.com'}            │
  │                                        │
  │<───────────────── 'authenticated' ─ ─ ─┤
  │                                        │
  ├─ emit('meeting:start') ────────────────>│
  │    {meetingId, hostUserId}            │
  │                                        ├─ Fetch ZAK
  │                                        │
  │<────────────── 'meeting:started' ─ ─ ─┤
  │    {zakToken, meetingId}              │
  │                                        │
  └─ Use token immediately                 │


┌─────────────────────────────────────────────────────────────┐
│                      HTTP FLOW                               │
└─────────────────────────────────────────────────────────────┘

Client                                   Server
  │                                        │
  ├─ POST /api/meetings/start ─────────────>│
  │    {meetingId, hostUserId}            │
  │                                        ├─ Fetch ZAK
  │                                        │
  │<──────────────────────── Response ─ ─ ─┤
  │    {zakToken, meetingId}              │
  │                                        │
  └─ Use token from response               │


┌─────────────────────────────────────────────────────────────┐
│                    COMPARISON TABLE                          │
└─────────────────────────────────────────────────────────────┘

Feature          WebSocket                  HTTP
─────────────────────────────────────────────────────────────
Connection       Persistent                 Request/Response
Latency          Lower (already connected)  Higher (new conn)
Complexity       Higher                     Lower
Real-time        Yes                        No
Broadcasting     Easy                       Difficult
Scaling          Harder                     Easier
Use Case         Live meetings              Simple apps
Reconnection     Auto-reconnect             N/A
State            Stateful                   Stateless

Recommendation:
• Use WebSocket for: Real-time collaborative features
• Use HTTP for: Simple request-response patterns
```

## 🎯 Quick Decision Guide

```
┌─────────────────────────────────────────────────────────────┐
│         WHEN TO USE WHICH TOKEN?                             │
└─────────────────────────────────────────────────────────────┘

Question: Who is starting/hosting the meeting?
Answer: The host/admin
Action: Use ZAK TOKEN
   │
   ├─ Fetch: GET /users/{hostUserId}/token?type=zak
   └─ Valid for: 2 hours

Question: Who is joining as a participant?
Answer: Regular participant
Action: Use OBF TOKEN
   │
   ├─ Fetch: GET /users/{participantUserId}/token
   │           ?type=onbehalf&meeting_id={meetingId}
   └─ Valid for: 30 minutes
   ⚠️  Must include meeting_id parameter


┌─────────────────────────────────────────────────────────────┐
│         WHEN TO USE WHICH ENDPOINT?                          │
└─────────────────────────────────────────────────────────────┘

Scenario: Host starts a meeting
Endpoint: POST /api/meetings/start
Body: {meetingId, hostUserId}
Returns: {zakToken}

Scenario: Single participant joins
Endpoint: POST /api/meetings/join
Body: {meetingId, participantUserId}
Returns: {obfToken}

Scenario: Multiple participants join at once
Endpoint: POST /api/meetings/batch-join
Body: {meetingId, participantUserIds: []}
Returns: {results: {successful: [], failed: []}}

Scenario: Complete meeting setup (host + participants)
Endpoint: POST /api/meetings/setup
Body: {meetingId, hostUserId, participantUserIds: []}
Returns: {host: {zakToken}, participants: [{obfToken}]}
```

---

This visual reference should help you understand the complete flow of the system!
