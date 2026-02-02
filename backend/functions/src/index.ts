import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { ZoomTokenService, ZoomTokenServiceConfig } from "./services/zoomTokenService";

admin.initializeApp();

const db = admin.firestore();

type AuthenticatedRequest = Request & {
  user?: admin.auth.DecodedIdToken;
};

const allowedDomains = (process.env.ZOOM_AUTHORIZED_DOMAINS ?? "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter((domain): domain is string => domain.length > 0);

const runtimeZoomConfig = functions.config().zoom ?? {};

const zoomConfig: ZoomTokenServiceConfig = {
  clientId:
    process.env.ZOOM_CLIENT_ID ??
    process.env.ZOOM_CLIENTID ??
    runtimeZoomConfig.client_id ??
    runtimeZoomConfig.clientId ??
    "",
  clientSecret:
    process.env.ZOOM_CLIENT_SECRET ??
    process.env.ZOOM_CLIENTSECRET ??
    runtimeZoomConfig.client_secret ??
    runtimeZoomConfig.clientSecret ??
    "",
  accountId:
    process.env.ZOOM_ACCOUNT_ID ??
    process.env.ZOOM_ACCOUNTID ??
    runtimeZoomConfig.account_id ??
    runtimeZoomConfig.accountId ??
    "",
  enableFirestoreCache: true,
};

if (!zoomConfig.clientId || !zoomConfig.clientSecret || !zoomConfig.accountId) {
  const hint = [
    "ZOOM_CLIENT_ID",
    "ZOOM_CLIENT_SECRET",
    "ZOOM_ACCOUNT_ID",
    "run `firebase functions:config:get` to inspect `zoom` namespace",
  ].join(", ");
functions.logger.error("zoomApi", "Missing Zoom credentials", { hint });
  throw new Error("Zoom credentials are missing; configure them via firebase functions:config:set");
}

const zoomService = new ZoomTokenService(zoomConfig, db);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: functions.config().version ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header missing or malformed" });
  }

  const idToken = authHeader.split(" ")[1];
  if (!idToken) {
    return res.status(401).json({ error: "Bearer token is required" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);

    if (allowedDomains.length && decoded.email) {
      const emailDomain = decoded.email.split("@")[1]?.toLowerCase() ?? "";
      if (!allowedDomains.includes(emailDomain)) {
        return res.status(403).json({ error: "Email domain not authorized to request Zoom tokens" });
      }
    }

    req.user = decoded;
    return next();
  } catch (error: unknown) {
    functions.logger.warn("zoomApi", "Firebase Auth verification failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return res.status(401).json({ error: "Invalid Firebase ID token" });
  }
};

const apiRouter = express.Router();
apiRouter.use(authenticate);

async function storeMeetingMetadata(
  meetingId: string,
  requester: admin.auth.DecodedIdToken | undefined,
  metadata: Record<string, unknown>
) {
  if (!requester) return;
  await db.collection("zoomMeetings").doc(meetingId).set(
    {
      ...metadata,
      requestedBy: requester.uid,
      requestedByEmail: requester.email ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

apiRouter.post("/meetings/start", async (req: AuthenticatedRequest, res: Response) => {
  const meetingId = String(req.body.meetingId ?? "").trim();
  const hostZoomUserId =
    String(req.body.hostZoomUserId ?? "").trim() ||
    req.user?.email ||
    req.user?.uid;

  if (!meetingId || !hostZoomUserId) {
    return res.status(400).json({ error: "meetingId + hostZoomUserId (or authenticated email) are required" });
  }

  try {
    const zakToken = await zoomService.getZAKToken(hostZoomUserId);
    await storeMeetingMetadata(meetingId, req.user, {
      hostZoomUserId,
      lastZakIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      meetingId,
      host: hostZoomUserId,
      zakToken,
    });
  } catch (error: unknown) {
    functions.logger.error("zoomApi", "ZOOM_ZAK_THROWN", {
      error: error instanceof Error ? error.message : "unknown",
      meetingId,
    });
    return res.status(500).json({ error: "Unable to issue ZAK token" });
  }
});

apiRouter.post("/meetings/join", async (req: AuthenticatedRequest, res: Response) => {
  const meetingId = String(req.body.meetingId ?? "").trim();
  const participantZoomUserId =
    String(req.body.participantZoomUserId ?? "").trim() ||
    req.user?.email ||
    req.user?.uid;

  if (!meetingId || !participantZoomUserId) {
    return res.status(400).json({ error: "meetingId + participantZoomUserId (or authenticated email) are required" });
  }

  try {
    const obfToken = await zoomService.getOBFToken(participantZoomUserId, meetingId);
    await storeMeetingMetadata(meetingId, req.user, {
      lastObfIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
      participantZoomUserId,
    });

    return res.json({
      meetingId,
      participant: participantZoomUserId,
      obfToken,
    });
  } catch (error: unknown) {
    functions.logger.error("zoomApi", "ZOOM_OBF_THROWN", {
      error: error instanceof Error ? error.message : "unknown",
      meetingId,
    });
    return res.status(500).json({ error: "Unable to issue OBF token" });
  }
});

apiRouter.post("/meetings/batch-join", async (req: AuthenticatedRequest, res: Response) => {
  const meetingId = String(req.body.meetingId ?? "").trim();
  const requestedParticipants: unknown[] = Array.isArray(req.body.participants) ? req.body.participants : [];
  const participantZoomUserIds = requestedParticipants
    .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  if (!meetingId || participantZoomUserIds.length === 0) {
    return res.status(400).json({ error: "meetingId + participants array are required" });
  }

  const results = await Promise.all(
    participantZoomUserIds.map(async (userId: string) => {
      try {
        const token = await zoomService.getOBFToken(userId, meetingId);
        return { userId, obfToken: token };
      } catch (error: unknown) {
        return {
          userId,
          error: error instanceof Error ? error.message : "unknown",
        };
      }
    })
  );

  await storeMeetingMetadata(meetingId, req.user, {
    batchParticipants: participantZoomUserIds,
    batchRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const successes = results.filter((result) => "obfToken" in result) as Array<{ userId: string; obfToken: string }>;
  const failures = results.filter((result) => "error" in result) as Array<{ userId: string; error: string }>;

  return res.json({
    meetingId,
    tokensIssued: successes.length,
    successful: successes,
    failed: failures,
  });
});

apiRouter.post("/meetings/setup", async (req: AuthenticatedRequest, res: Response) => {
  const meetingId = String(req.body.meetingId ?? "").trim();
  const hostZoomUserId =
    String(req.body.hostZoomUserId ?? "").trim() ||
    req.user?.email ||
    req.user?.uid;
  const participantZoomUserIds = Array.isArray(req.body.participantZoomUserIds)
    ? (req.body.participantZoomUserIds as string[])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0)
    : [];

  if (!meetingId || !hostZoomUserId) {
    return res.status(400).json({ error: "meetingId + hostZoomUserId (or authenticated email) are required" });
  }

  try {
    const meetingTokens = await zoomService.getMeetingTokens(hostZoomUserId, meetingId, participantZoomUserIds);
    await storeMeetingMetadata(meetingId, req.user, {
      meetingTokensRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      meetingTokensSummary: {
        host: meetingTokens.host.userId,
        participants: meetingTokens.participants.map((p) => p.userId),
      },
    });

    return res.json(meetingTokens);
  } catch (error: unknown) {
    functions.logger.error("zoomApi", "ZOOM_SETUP_THROWN", {
      error: error instanceof Error ? error.message : "unknown",
      meetingId,
    });
    return res.status(500).json({ error: "Unable to complete meeting setup" });
  }
});

app.use("/api", apiRouter);

export const zoomApi = onRequest({ region: "us-central1" }, app);
