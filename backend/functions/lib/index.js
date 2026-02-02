"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
Object.defineProperty(exports, "__esModule", { value: true });
exports.zoomApi = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const https_1 = require("firebase-functions/v2/https");
const zoomTokenService_1 = require("./services/zoomTokenService");
admin.initializeApp();
const db = admin.firestore();
const allowedDomains = ((_a = process.env.ZOOM_AUTHORIZED_DOMAINS) !== null && _a !== void 0 ? _a : "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
const runtimeZoomConfig = (_b = functions.config().zoom) !== null && _b !== void 0 ? _b : {};
const zoomConfig = {
    clientId: (_f = (_e = (_d = (_c = process.env.ZOOM_CLIENT_ID) !== null && _c !== void 0 ? _c : process.env.ZOOM_CLIENTID) !== null && _d !== void 0 ? _d : runtimeZoomConfig.client_id) !== null && _e !== void 0 ? _e : runtimeZoomConfig.clientId) !== null && _f !== void 0 ? _f : "",
    clientSecret: (_k = (_j = (_h = (_g = process.env.ZOOM_CLIENT_SECRET) !== null && _g !== void 0 ? _g : process.env.ZOOM_CLIENTSECRET) !== null && _h !== void 0 ? _h : runtimeZoomConfig.client_secret) !== null && _j !== void 0 ? _j : runtimeZoomConfig.clientSecret) !== null && _k !== void 0 ? _k : "",
    accountId: (_p = (_o = (_m = (_l = process.env.ZOOM_ACCOUNT_ID) !== null && _l !== void 0 ? _l : process.env.ZOOM_ACCOUNTID) !== null && _m !== void 0 ? _m : runtimeZoomConfig.account_id) !== null && _o !== void 0 ? _o : runtimeZoomConfig.accountId) !== null && _p !== void 0 ? _p : "",
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
const zoomService = new zoomTokenService_1.ZoomTokenService(zoomConfig, db);
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json());
app.get("/api/health", (req, res) => {
    var _a;
    res.json({
        status: "ok",
        version: (_a = functions.config().version) !== null && _a !== void 0 ? _a : "unknown",
        timestamp: new Date().toISOString(),
    });
});
const authenticate = async (req, res, next) => {
    var _a, _b;
    const authHeader = req.headers.authorization;
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))) {
        return res.status(401).json({ error: "Authorization header missing or malformed" });
    }
    const idToken = authHeader.split(" ")[1];
    if (!idToken) {
        return res.status(401).json({ error: "Bearer token is required" });
    }
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        if (allowedDomains.length && decoded.email) {
            const emailDomain = (_b = (_a = decoded.email.split("@")[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : "";
            if (!allowedDomains.includes(emailDomain)) {
                return res.status(403).json({ error: "Email domain not authorized to request Zoom tokens" });
            }
        }
        req.user = decoded;
        return next();
    }
    catch (error) {
        functions.logger.warn("zoomApi", "Firebase Auth verification failed", {
            error: error instanceof Error ? error.message : "unknown",
        });
        return res.status(401).json({ error: "Invalid Firebase ID token" });
    }
};
const apiRouter = express_1.default.Router();
apiRouter.use(authenticate);
async function storeMeetingMetadata(meetingId, requester, metadata) {
    var _a;
    if (!requester)
        return;
    await db.collection("zoomMeetings").doc(meetingId).set({
        ...metadata,
        requestedBy: requester.uid,
        requestedByEmail: (_a = requester.email) !== null && _a !== void 0 ? _a : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}
apiRouter.post("/meetings/start", async (req, res) => {
    var _a, _b, _c, _d;
    const meetingId = String((_a = req.body.meetingId) !== null && _a !== void 0 ? _a : "").trim();
    const hostZoomUserId = String((_b = req.body.hostZoomUserId) !== null && _b !== void 0 ? _b : "").trim() ||
        ((_c = req.user) === null || _c === void 0 ? void 0 : _c.email) ||
        ((_d = req.user) === null || _d === void 0 ? void 0 : _d.uid);
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
    }
    catch (error) {
        functions.logger.error("zoomApi", "ZOOM_ZAK_THROWN", {
            error: error instanceof Error ? error.message : "unknown",
            meetingId,
        });
        return res.status(500).json({ error: "Unable to issue ZAK token" });
    }
});
apiRouter.post("/meetings/join", async (req, res) => {
    var _a, _b, _c, _d;
    const meetingId = String((_a = req.body.meetingId) !== null && _a !== void 0 ? _a : "").trim();
    const participantZoomUserId = String((_b = req.body.participantZoomUserId) !== null && _b !== void 0 ? _b : "").trim() ||
        ((_c = req.user) === null || _c === void 0 ? void 0 : _c.email) ||
        ((_d = req.user) === null || _d === void 0 ? void 0 : _d.uid);
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
    }
    catch (error) {
        functions.logger.error("zoomApi", "ZOOM_OBF_THROWN", {
            error: error instanceof Error ? error.message : "unknown",
            meetingId,
        });
        return res.status(500).json({ error: "Unable to issue OBF token" });
    }
});
apiRouter.post("/meetings/batch-join", async (req, res) => {
    var _a;
    const meetingId = String((_a = req.body.meetingId) !== null && _a !== void 0 ? _a : "").trim();
    const requestedParticipants = Array.isArray(req.body.participants) ? req.body.participants : [];
    const participantZoomUserIds = requestedParticipants
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
    if (!meetingId || participantZoomUserIds.length === 0) {
        return res.status(400).json({ error: "meetingId + participants array are required" });
    }
    const results = await Promise.all(participantZoomUserIds.map(async (userId) => {
        try {
            const token = await zoomService.getOBFToken(userId, meetingId);
            return { userId, obfToken: token };
        }
        catch (error) {
            return {
                userId,
                error: error instanceof Error ? error.message : "unknown",
            };
        }
    }));
    await storeMeetingMetadata(meetingId, req.user, {
        batchParticipants: participantZoomUserIds,
        batchRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const successes = results.filter((result) => "obfToken" in result);
    const failures = results.filter((result) => "error" in result);
    return res.json({
        meetingId,
        tokensIssued: successes.length,
        successful: successes,
        failed: failures,
    });
});
apiRouter.post("/meetings/setup", async (req, res) => {
    var _a, _b, _c, _d;
    const meetingId = String((_a = req.body.meetingId) !== null && _a !== void 0 ? _a : "").trim();
    const hostZoomUserId = String((_b = req.body.hostZoomUserId) !== null && _b !== void 0 ? _b : "").trim() ||
        ((_c = req.user) === null || _c === void 0 ? void 0 : _c.email) ||
        ((_d = req.user) === null || _d === void 0 ? void 0 : _d.uid);
    const participantZoomUserIds = Array.isArray(req.body.participantZoomUserIds)
        ? req.body.participantZoomUserIds
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
    }
    catch (error) {
        functions.logger.error("zoomApi", "ZOOM_SETUP_THROWN", {
            error: error instanceof Error ? error.message : "unknown",
            meetingId,
        });
        return res.status(500).json({ error: "Unable to complete meeting setup" });
    }
});
app.use("/api", apiRouter);
exports.zoomApi = (0, https_1.onRequest)({ region: "us-central1" }, app);
//# sourceMappingURL=index.js.map