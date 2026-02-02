import axios from "axios";
import { Firestore, DocumentReference } from "firebase-admin/firestore";
import * as functions from "firebase-functions";

const CACHE_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer to avoid using expired tokens
const CACHE_PATH = "zoom/tokenCache";

export interface ZoomTokenServiceConfig {
  clientId: string;
  clientSecret: string;
  accountId: string;
  enableFirestoreCache?: boolean;
}

export interface MeetingTokensResponse {
  host: {
    userId: string;
    zakToken: string;
  };
  participants: Array<{
    userId: string;
    obfToken: string;
  }>;
  failed: Array<{
    userId: string;
    error: string;
  }>;
  meetingId: string;
  timestamp: string;
}

interface CachePayload {
  accessToken: string;
  expiry: number;
}

export class ZoomTokenService {
  private baseURL = "https://api.zoom.us/v2";
  private oauthURL = "https://zoom.us/oauth/token";
  private accessToken: string | null = null;
  private accessTokenExpiry: number | null = null;
  private cacheDocRef: DocumentReference | null = null;

  constructor(private config: ZoomTokenServiceConfig, private firestore?: Firestore) {
    if (!config.clientId || !config.clientSecret || !config.accountId) {
      throw new Error("Zoom credentials (clientId/clientSecret/accountId) must be provided");
    }
    if (config.enableFirestoreCache && this.firestore) {
      this.cacheDocRef = this.firestore.doc(CACHE_PATH);
    }
  }

  private async readFirestoreCache(): Promise<CachePayload | null> {
    if (!this.cacheDocRef) return null;
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

  private async writeFirestoreCache(payload: CachePayload): Promise<void> {
    if (!this.cacheDocRef) return;
    await this.cacheDocRef.set(payload, { merge: true });
  }

  private isTokenValid(expiry: number | null): boolean {
    if (!expiry) return false;
    return Date.now() < expiry - CACHE_BUFFER_MS;
  }

  async getAccessToken(): Promise<string> {
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
      const response = await axios.post(
        this.oauthURL,
        null,
        {
          params: {
            grant_type: "account_credentials",
            account_id: this.config.accountId,
          },
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

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
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error while obtaining Zoom access token";
      functions.logger.error("zoomService", "Failed to obtain access token", { error: message });
      throw new Error(`Zoom OAuth failed: ${message}`);
    }
  }

  async getZAKToken(userId: string): Promise<string> {
    functions.logger.info("zoomService", "Fetching ZAK token", { userId });
    const accessToken = await this.getAccessToken();
    const response = await axios.get(`${this.baseURL}/users/${encodeURIComponent(userId)}/token`, {
      params: { type: "zak" },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response.data.token;
  }

  async getOBFToken(userId: string, meetingId: string): Promise<string> {
    if (!meetingId) {
      throw new Error("Meeting ID is required to request an OBF token");
    }
    functions.logger.info("zoomService", "Fetching OBF token", { userId, meetingId });
    const accessToken = await this.getAccessToken();
    const response = await axios.get(`${this.baseURL}/users/${encodeURIComponent(userId)}/token`, {
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

  async getMeetingTokens(hostUserId: string, meetingId: string, participantUserIds: string[]): Promise<MeetingTokensResponse> {
    const timestamp = new Date().toISOString();
    functions.logger.info("zoomService", "Fetching meeting tokens", {
      hostUserId,
      meetingId,
      participants: participantUserIds.length,
    });

    const zakToken = await this.getZAKToken(hostUserId);

    const participantResults = await Promise.all(
      participantUserIds.map(async (userId) => {
        try {
          const obfToken = await this.getOBFToken(userId, meetingId);
          return { userId, obfToken };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Unknown error";
          functions.logger.warn("zoomService", "Participant token failed", { userId, error: message });
          return { userId, error: message };
        }
      })
    );

    const successful = participantResults.filter((result): result is { userId: string; obfToken: string } => "obfToken" in result);
    const failed = participantResults.filter((result): result is { userId: string; error: string } => "error" in result);

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

  clearCache(): void {
    this.accessToken = null;
    this.accessTokenExpiry = null;
    if (this.cacheDocRef) {
      this.cacheDocRef.delete().catch((error) => {
    functions.logger.error("zoomService", "Failed to clear cache doc", { error: error instanceof Error ? error.message : error });
      });
    }
  }
}
