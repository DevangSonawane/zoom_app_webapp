/**
 * Main Server Application
 * Zoom Token Distribution System
 *
 * Architecture mirrors backend/functions/index.js (Firebase Cloud Functions)
 * so that both backends expose an identical API surface.
 *
 * Key additions over the original standalone server:
 * - Firebase Admin SDK (Firestore for token persistence, Auth for middleware)
 * - Per-user OAuth (authorization_code) instead of Server-to-Server OAuth
 * - Firebase Auth middleware on protected routes
 * - Zoom OAuth browser redirect handler (GET /api/auth/zoom/callback)
 * - Meeting metadata stored in Firestore
 */

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const admin = require("firebase-admin");

const { ZoomTokenService } = require("./services/zoomTokenService");
const WebSocketHandler = require("./websocket/websocketHandler");

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------

admin.initializeApp();
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;

const allowedDomains = (process.env.ZOOM_AUTHORIZED_DOMAINS || "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter((d) => d.length > 0);

const zoomConfig = {
  clientId: process.env.ZOOM_CLIENT_ID || "",
  clientSecret: process.env.ZOOM_CLIENT_SECRET || "",
  redirectUri: process.env.ZOOM_REDIRECT_URI || "",
};

if (!zoomConfig.clientId || !zoomConfig.clientSecret || !zoomConfig.redirectUri) {
  const hint = "ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_REDIRECT_URI";
  console.error(`[server] Missing Zoom credentials (${hint}). Configure them in .env.`);
  process.exit(1);
}

const zoomService = new ZoomTokenService(zoomConfig, db);

// Deep link scheme for redirecting back to the Flutter app after OAuth
const APP_DEEP_LINK = process.env.ZOOM_APP_DEEP_LINK || "zoomtest://oauth";

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

// ---------------------------------------------------------------------------
// WebSocket (retained from the original server)
// ---------------------------------------------------------------------------

const wsHandler = new WebSocketHandler(server, zoomService);
app.locals.io = wsHandler.getIO();

// ---------------------------------------------------------------------------
// Health check (no auth)
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    version: process.env.APP_VERSION || "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Zoom OAuth browser redirect handler (NO Firebase auth -- Zoom redirects here)
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/zoom/callback
 *
 * Zoom redirects the user's browser here after they approve the OAuth consent.
 * Query params: ?code=xxx&state=firebaseUid
 *
 * The `state` param carries the Firebase UID so we know which user to store
 * tokens for. After exchanging the code, we redirect the browser to the
 * Flutter deep link so the app regains focus.
 */
app.get("/api/auth/zoom/callback", async (req, res) => {
  const code = String(req.query.code || "").trim();
  const state = String(req.query.state || "").trim(); // Firebase UID
  const error = req.query.error;

  if (error) {
    console.warn("[server] OAuth denied by user", { error });
    const params = new URLSearchParams({ success: "false", error });
    return res.redirect(`${APP_DEEP_LINK}?${params.toString()}`);
  }

  if (!code || !state) {
    return res.status(400).json({ error: "Missing code or state in OAuth callback" });
  }

  try {
    const { zoomUserId } = await zoomService.exchangeCodeForTokens(code, state);

    console.log("[server] OAuth callback success", {
      firebaseUid: state,
      zoomUserId,
    });

    const params = new URLSearchParams({
      success: "true",
      zoom_user_id: zoomUserId,
    });
    return res.redirect(`${APP_DEEP_LINK}?${params.toString()}`);
  } catch (err) {
    console.error("[server] OAuth callback exchange failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    const params = new URLSearchParams({
      success: "false",
      error: "token_exchange_failed",
    });
    return res.redirect(`${APP_DEEP_LINK}?${params.toString()}`);
  }
});

// ---------------------------------------------------------------------------
// Firebase Auth middleware
// ---------------------------------------------------------------------------

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header missing or malformed" });
  }

  const idToken = authHeader.split(" ")[1];
  if (!idToken) {
    return res.status(401).json({ error: "Bearer token is required" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    if (allowedDomains.length && decoded.email) {
      const emailDomain = (decoded.email.split("@")[1] || "").toLowerCase();
      if (!allowedDomains.includes(emailDomain)) {
        return res.status(403).json({ error: "Email domain not authorized" });
      }
    }

    req.user = decoded;
    return next();
  } catch (error) {
    console.warn("[server] Firebase Auth verification failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return res.status(401).json({ error: "Invalid Firebase ID token" });
  }
};

const apiRouter = express.Router();
apiRouter.use(authenticate);

// ---------------------------------------------------------------------------
// Zoom OAuth endpoints (authenticated)
// ---------------------------------------------------------------------------

/** GET /api/auth/zoom/url -- returns the Zoom OAuth consent URL. */
apiRouter.get("/auth/zoom/url", (req, res) => {
  const state = req.user.uid;
  const codeChallenge = req.query.code_challenge;
  const url = zoomService.getAuthorizationURL(state, codeChallenge);
  return res.json({ url, state });
});

/** POST /api/auth/zoom/callback -- exchanges an auth code for tokens (from Flutter). */
apiRouter.post("/auth/zoom/callback", async (req, res) => {
  const code = String(req.body.code || "").trim();
  if (!code) {
    return res.status(400).json({ error: "Authorization code is required" });
  }

  try {
    const { zoomUserId } = await zoomService.exchangeCodeForTokens(code, req.user.uid);
    return res.json({ success: true, message: "Zoom account connected", zoomUserId });
  } catch (error) {
    console.error("[server] ZOOM_OAUTH_CALLBACK_FAILED", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return res.status(500).json({ error: "Failed to connect Zoom account" });
  }
});

/** GET /api/auth/zoom/status -- check if the user's Zoom account is linked. */
apiRouter.get("/auth/zoom/status", async (req, res) => {
  try {
    const status = await zoomService.isZoomConnected(req.user.uid);
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: "Failed to check Zoom status" });
  }
});

/** POST /api/auth/zoom/disconnect -- remove stored Zoom tokens. */
apiRouter.post("/auth/zoom/disconnect", async (req, res) => {
  try {
    await zoomService.disconnectZoom(req.user.uid);
    return res.json({ success: true, message: "Zoom account disconnected" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to disconnect Zoom account" });
  }
});

// ---------------------------------------------------------------------------
// Meeting token endpoints
// ---------------------------------------------------------------------------

async function storeMeetingMetadata(meetingId, requester, metadata) {
  if (!requester) return;
  await db
    .collection("zoomMeetings")
    .doc(meetingId)
    .set(
      {
        ...metadata,
        requestedBy: requester.uid,
        requestedByEmail: requester.email || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/** POST /api/meetings/start -- issue ZAK token for the authenticated user. */
apiRouter.post("/meetings/start", async (req, res) => {
  const meetingId = String(req.body.meetingId || "").trim();
  if (!meetingId) {
    return res.status(400).json({ error: "meetingId is required" });
  }

  try {
    const { zakToken, zoomUserId } = await zoomService.getZAKToken(req.user.uid);
    await storeMeetingMetadata(meetingId, req.user, {
      hostZoomUserId: zoomUserId,
      lastZakIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Broadcast via WebSocket if available
    if (app.locals.io) {
      app.locals.io.to(`user:${req.user.uid}`).emit("meeting:started", {
        meetingId,
        zakToken,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({ meetingId, host: zoomUserId, zakToken });
  } catch (error) {
    console.error("[server] ZOOM_ZAK_THROWN", {
      error: error instanceof Error ? error.message : "unknown",
      meetingId,
    });
    const message = error instanceof Error ? error.message : "Unable to issue ZAK token";
    return res.status(500).json({ error: message });
  }
});

/** POST /api/meetings/join -- issue OBF token for the authenticated user. */
apiRouter.post("/meetings/join", async (req, res) => {
  const meetingId = String(req.body.meetingId || "").trim();
  if (!meetingId) {
    return res.status(400).json({ error: "meetingId is required" });
  }

  try {
    const { obfToken, zoomUserId } = await zoomService.getOBFToken(
      req.user.uid,
      meetingId
    );
    await storeMeetingMetadata(meetingId, req.user, {
      lastObfIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
      participantZoomUserId: zoomUserId,
    });

    // Broadcast via WebSocket if available
    if (app.locals.io) {
      app.locals.io.to(`user:${req.user.uid}`).emit("meeting:credentials", {
        meetingId,
        obfToken,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({ meetingId, participant: zoomUserId, obfToken });
  } catch (error) {
    console.error("[server] ZOOM_OBF_THROWN", {
      error: error instanceof Error ? error.message : "unknown",
      meetingId,
    });
    const message = error instanceof Error ? error.message : "Unable to issue OBF token";
    return res.status(500).json({ error: message });
  }
});

/** POST /api/meetings/batch-join -- issue OBF tokens for multiple users. */
apiRouter.post("/meetings/batch-join", async (req, res) => {
  const meetingId = String(req.body.meetingId || "").trim();
  const participantUids = (
    Array.isArray(req.body.participants) ? req.body.participants : []
  )
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);

  if (!meetingId || participantUids.length === 0) {
    return res.status(400).json({
      error: "meetingId + participants array (Firebase UIDs) are required",
    });
  }

  const results = await Promise.all(
    participantUids.map(async (uid) => {
      try {
        const { obfToken, zoomUserId } = await zoomService.getOBFToken(uid, meetingId);

        // Broadcast via WebSocket if available
        if (app.locals.io) {
          app.locals.io.to(`user:${uid}`).emit("meeting:credentials", {
            meetingId,
            obfToken,
            timestamp: new Date().toISOString(),
          });
        }

        return { userId: zoomUserId, firebaseUid: uid, obfToken };
      } catch (error) {
        return {
          userId: uid,
          firebaseUid: uid,
          error: error instanceof Error ? error.message : "unknown",
        };
      }
    })
  );

  await storeMeetingMetadata(meetingId, req.user, {
    batchParticipants: participantUids,
    batchRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const successes = results.filter((r) => "obfToken" in r);
  const failures = results.filter((r) => "error" in r);

  return res.json({
    meetingId,
    tokensIssued: successes.length,
    successful: successes,
    failed: failures,
  });
});

/** POST /api/meetings/setup -- combined host ZAK + participant OBF tokens. */
apiRouter.post("/meetings/setup", async (req, res) => {
  const meetingId = String(req.body.meetingId || "").trim();
  const hostFirebaseUid =
    String(req.body.hostFirebaseUid || "").trim() || req.user.uid;
  const participantFirebaseUids = (
    Array.isArray(req.body.participantFirebaseUids)
      ? req.body.participantFirebaseUids
      : []
  )
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);

  if (!meetingId) {
    return res.status(400).json({ error: "meetingId is required" });
  }

  try {
    const meetingTokens = await zoomService.getMeetingTokens(
      hostFirebaseUid,
      meetingId,
      participantFirebaseUids
    );
    await storeMeetingMetadata(meetingId, req.user, {
      meetingTokensRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      meetingTokensSummary: {
        host: meetingTokens.host.userId,
        participants: meetingTokens.participants.map((p) => p.userId),
      },
    });

    // Broadcast via WebSocket if available
    if (app.locals.io) {
      app.locals.io.to(`user:${hostFirebaseUid}`).emit("meeting:started", {
        meetingId,
        zakToken: meetingTokens.host.zakToken,
        timestamp: meetingTokens.timestamp,
      });

      meetingTokens.participants.forEach((participant) => {
        app.locals.io
          .to(`user:${participant.userId}`)
          .emit("meeting:credentials", {
            meetingId,
            obfToken: participant.obfToken,
            timestamp: meetingTokens.timestamp,
          });
      });
    }

    return res.json(meetingTokens);
  } catch (error) {
    console.error("[server] ZOOM_SETUP_THROWN", {
      error: error instanceof Error ? error.message : "unknown",
      meetingId,
    });
    const message =
      error instanceof Error ? error.message : "Unable to complete meeting setup";
    return res.status(500).json({ error: message });
  }
});

app.use("/api", apiRouter);

// ---------------------------------------------------------------------------
// Root / info endpoint
// ---------------------------------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    service: "Zoom Token Distribution API",
    version: process.env.APP_VERSION || "1.0.0",
    status: "running",
    endpoints: {
      health: "GET /api/health",
      authZoomUrl: "GET /api/auth/zoom/url",
      authZoomCallbackBrowser: "GET /api/auth/zoom/callback",
      authZoomCallbackPost: "POST /api/auth/zoom/callback",
      authZoomStatus: "GET /api/auth/zoom/status",
      authZoomDisconnect: "POST /api/auth/zoom/disconnect",
      startMeeting: "POST /api/meetings/start",
      joinMeeting: "POST /api/meetings/join",
      batchJoin: "POST /api/meetings/batch-join",
      setupMeeting: "POST /api/meetings/setup",
    },
    websocket: {
      url: `ws://localhost:${PORT}`,
      events: {
        client: ["authenticate", "meeting:start", "meeting:join", "meeting:distribute", "ping"],
        server: ["authenticated", "meeting:started", "meeting:credentials", "meeting:distributed", "error", "pong"],
      },
    },
  });
});

// ---------------------------------------------------------------------------
// 404 & error handlers
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`\n[server] Zoom Token Distribution Server started on port ${PORT}`);
  console.log(`[server] HTTP  -> http://localhost:${PORT}`);
  console.log(`[server] WS    -> ws://localhost:${PORT}`);
  console.log(`[server] OAuth -> Per-user authorization_code flow (Firestore-backed)\n`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM received, shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[server] SIGINT received, shutting down...");
  server.close(() => process.exit(0));
});

module.exports = { app, server };
