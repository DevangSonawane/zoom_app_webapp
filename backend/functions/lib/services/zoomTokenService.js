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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZoomTokenService = void 0;
const axios_1 = __importDefault(require("axios"));
const functions = __importStar(require("firebase-functions"));
const CACHE_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer to avoid using expired tokens
const CACHE_PATH = "zoom/tokenCache";
class ZoomTokenService {
    constructor(config, firestore) {
        this.config = config;
        this.firestore = firestore;
        this.baseURL = "https://api.zoom.us/v2";
        this.oauthURL = "https://zoom.us/oauth/token";
        this.accessToken = null;
        this.accessTokenExpiry = null;
        this.cacheDocRef = null;
        if (!config.clientId || !config.clientSecret || !config.accountId) {
            throw new Error("Zoom credentials (clientId/clientSecret/accountId) must be provided");
        }
        if (config.enableFirestoreCache && this.firestore) {
            this.cacheDocRef = this.firestore.doc(CACHE_PATH);
        }
    }
    async readFirestoreCache() {
        if (!this.cacheDocRef)
            return null;
        const doc = await this.cacheDocRef.get();
        const data = doc.data();
        if (!data || typeof data.accessToken !== "string" || typeof data.expiry !== "number") {
            return null;
        }
        return {
            accessToken: data.accessToken,
            expiry: data.expiry,
        };
    }
    async writeFirestoreCache(payload) {
        if (!this.cacheDocRef)
            return;
        await this.cacheDocRef.set(payload, { merge: true });
    }
    isTokenValid(expiry) {
        if (!expiry)
            return false;
        return Date.now() < expiry - CACHE_BUFFER_MS;
    }
    async getAccessToken() {
        if (this.accessToken && this.isTokenValid(this.accessTokenExpiry)) {
            functions.logger.debug("zoomService", "Using cached access token (memory)");
            return this.accessToken;
        }
        if (!this.accessToken && this.cacheDocRef) {
            const cached = await this.readFirestoreCache();
            if (cached && this.isTokenValid(cached.expiry)) {
                this.accessToken = cached.accessToken;
                this.accessTokenExpiry = cached.expiry;
                functions.logger.debug("zoomService", "Using cached access token (Firestore)");
                return this.accessToken;
            }
        }
        functions.logger.info("zoomService", "Fetching new Zoom access token");
        const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
        try {
            const response = await axios_1.default.post(this.oauthURL, null, {
                params: {
                    grant_type: "account_credentials",
                    account_id: this.config.accountId,
                },
                headers: {
                    Authorization: `Basic ${credentials}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });
            const accessToken = response.data.access_token;
            const expiry = Date.now() + response.data.expires_in * 1000;
            this.accessToken = accessToken;
            this.accessTokenExpiry = expiry;
            await this.writeFirestoreCache({
                accessToken,
                expiry,
            });
            functions.logger.info("zoomService", "New access token obtained");
            return accessToken;
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Unknown error while obtaining Zoom access token";
            functions.logger.error("zoomService", "Failed to obtain access token", { error: message });
            throw new Error(`Zoom OAuth failed: ${message}`);
        }
    }
    async getZAKToken(userId) {
        functions.logger.info("zoomService", "Fetching ZAK token", { userId });
        const accessToken = await this.getAccessToken();
        const response = await axios_1.default.get(`${this.baseURL}/users/${encodeURIComponent(userId)}/token`, {
            params: { type: "zak" },
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
        return response.data.token;
    }
    async getOBFToken(userId, meetingId) {
        if (!meetingId) {
            throw new Error("Meeting ID is required to request an OBF token");
        }
        functions.logger.info("zoomService", "Fetching OBF token", { userId, meetingId });
        const accessToken = await this.getAccessToken();
        const response = await axios_1.default.get(`${this.baseURL}/users/${encodeURIComponent(userId)}/token`, {
            params: {
                type: "onbehalf",
                meeting_id: meetingId,
            },
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
        return response.data.token;
    }
    async getMeetingTokens(hostUserId, meetingId, participantUserIds) {
        const timestamp = new Date().toISOString();
        functions.logger.info("zoomService", "Fetching meeting tokens", {
            hostUserId,
            meetingId,
            participants: participantUserIds.length,
        });
        const zakToken = await this.getZAKToken(hostUserId);
        const participantResults = await Promise.all(participantUserIds.map(async (userId) => {
            try {
                const obfToken = await this.getOBFToken(userId, meetingId);
                return { userId, obfToken };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                functions.logger.warn("zoomService", "Participant token failed", { userId, error: message });
                return { userId, error: message };
            }
        }));
        const successful = participantResults.filter((result) => "obfToken" in result);
        const failed = participantResults.filter((result) => "error" in result);
        return {
            host: {
                userId: hostUserId,
                zakToken,
            },
            participants: successful,
            failed,
            meetingId,
            timestamp,
        };
    }
    clearCache() {
        this.accessToken = null;
        this.accessTokenExpiry = null;
        if (this.cacheDocRef) {
            this.cacheDocRef.delete().catch((error) => {
                functions.logger.error("zoomService", "Failed to clear cache doc", { error: error instanceof Error ? error.message : error });
            });
        }
    }
}
exports.ZoomTokenService = ZoomTokenService;
//# sourceMappingURL=zoomTokenService.js.map