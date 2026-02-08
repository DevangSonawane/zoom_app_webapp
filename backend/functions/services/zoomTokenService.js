const axios = require("axios");
const functions = require("firebase-functions");

const CACHE_BUFFER_MS = 5 * 60 * 1000; // 5-minute buffer before expiry

/**
 * ZoomTokenService -- OAuth (authorization_code) flow.
 *
 * Each Firebase user connects their Zoom account once via the OAuth consent
 * screen. The resulting refresh token is stored in Firestore and used to
 * obtain short-lived access tokens on demand.
 */
class ZoomTokenService {
  constructor(config, firestore) {
    this.config = config;
    this.firestore = firestore;
    this.baseURL = "https://api.zoom.us/v2";
    this.oauthURL = "https://zoom.us/oauth/token";
    this.authorizeURL = "https://zoom.us/oauth/authorize";

    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      throw new Error(
        "Zoom OAuth credentials (clientId, clientSecret, redirectUri) must be provided"
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 1. OAuth authorization helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the Zoom OAuth consent URL.
   * @param {string} state - opaque string for CSRF (e.g. Firebase UID)
   * @param {string} [codeChallenge] - PKCE code challenge (optional)
   * @returns {string} full authorization URL
   */
  getAuthorizationURL(state, codeChallenge) {
    const params = {
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state,
    };

    if (codeChallenge) {
      params.code_challenge = codeChallenge;
      params.code_challenge_method = "S256";
    }

    const qs = new URLSearchParams(params);
    return `${this.authorizeURL}?${qs.toString()}`;
  }

  /**
   * Exchange an authorization code for access + refresh tokens and persist
   * them in Firestore under zoomTokens/{firebaseUid}.
   * @param {string} code - authorization code from Zoom
   * @param {string} firebaseUid - Firebase user ID to store tokens for
   * @param {string} [codeVerifier] - PKCE code verifier (optional)
   * @returns {Promise<{zoomUserId: string}>}
   */
  async exchangeCodeForTokens(code, firebaseUid, codeVerifier) {
    functions.logger.info("zoomService", "Exchanging auth code for tokens");

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString("base64");

    try {
      const tokenParams = {
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.redirectUri,
      };
      if (codeVerifier) {
        tokenParams.code_verifier = codeVerifier;
      }

      const response = await axios.post(this.oauthURL, null, {
        params: tokenParams,
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const expiry = Date.now() + expires_in * 1000;

      // Fetch the Zoom user profile to get their Zoom user ID
      const profileRes = await axios.get(`${this.baseURL}/users/me`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const zoomUserId = profileRes.data.id;

      // Persist tokens keyed by Firebase UID
      await this.firestore
        .collection("zoomTokens")
        .doc(firebaseUid)
        .set(
          { accessToken: access_token, refreshToken: refresh_token, expiry, zoomUserId },
          { merge: true }
        );

      functions.logger.info("zoomService", "Zoom account connected", {
        firebaseUid,
        zoomUserId,
      });

      return { zoomUserId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during code exchange";
      functions.logger.error("zoomService", "Code exchange failed", { error: message });
      throw new Error(`Zoom OAuth code exchange failed: ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Per-user access token management
  // ---------------------------------------------------------------------------

  /**
   * Return a valid access token for a given Firebase user, refreshing if needed.
   * Throws if the user has not connected their Zoom account.
   * @param {string} firebaseUid
   * @returns {Promise<{accessToken: string, zoomUserId: string}>}
   */
  async getAccessTokenForUser(firebaseUid) {
    const docRef = this.firestore.collection("zoomTokens").doc(firebaseUid);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error("Zoom account not connected. Please authorize via /api/auth/zoom/url first.");
    }

    const data = doc.data();

    // If the stored access token is still valid, use it
    if (data.accessToken && Date.now() < data.expiry - CACHE_BUFFER_MS) {
      functions.logger.debug("zoomService", "Using stored access token", { firebaseUid });
      return { accessToken: data.accessToken, zoomUserId: data.zoomUserId };
    }

    // Otherwise refresh
    functions.logger.info("zoomService", "Refreshing Zoom access token", { firebaseUid });
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString("base64");

    try {
      const response = await axios.post(this.oauthURL, null, {
        params: {
          grant_type: "refresh_token",
          refresh_token: data.refreshToken,
        },
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const expiry = Date.now() + expires_in * 1000;

      // Zoom may rotate the refresh token -- always persist the latest one
      await docRef.set(
        {
          accessToken: access_token,
          refreshToken: refresh_token || data.refreshToken,
          expiry,
        },
        { merge: true }
      );

      return { accessToken: access_token, zoomUserId: data.zoomUserId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during token refresh";
      functions.logger.error("zoomService", "Token refresh failed", {
        firebaseUid,
        error: message,
      });
      throw new Error(
        `Zoom token refresh failed: ${message}. The user may need to re-authorize.`
      );
    }
  }

  /**
   * Check whether a Firebase user has connected their Zoom account.
   * @param {string} firebaseUid
   * @returns {Promise<{connected: boolean, zoomUserId?: string}>}
   */
  async isZoomConnected(firebaseUid) {
    const doc = await this.firestore.collection("zoomTokens").doc(firebaseUid).get();
    if (!doc.exists) return { connected: false };
    const data = doc.data();
    return { connected: true, zoomUserId: data.zoomUserId };
  }

  /**
   * Disconnect a user's Zoom account by deleting stored tokens.
   * @param {string} firebaseUid
   */
  async disconnectZoom(firebaseUid) {
    await this.firestore.collection("zoomTokens").doc(firebaseUid).delete();
    functions.logger.info("zoomService", "Zoom account disconnected", { firebaseUid });
  }

  // ---------------------------------------------------------------------------
  // 3. ZAK / OBF token fetching (uses per-user access token)
  // ---------------------------------------------------------------------------

  /**
   * @param {string} firebaseUid
   * @returns {Promise<{zakToken: string, zoomUserId: string}>}
   */
  async getZAKToken(firebaseUid) {
    const { accessToken, zoomUserId } = await this.getAccessTokenForUser(firebaseUid);
    functions.logger.info("zoomService", "Fetching ZAK token", { firebaseUid, zoomUserId });

    const response = await axios.get(
      `${this.baseURL}/users/${encodeURIComponent(zoomUserId)}/token`,
      {
        params: { type: "zak" },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return { zakToken: response.data.token, zoomUserId };
  }

  /**
   * @param {string} firebaseUid
   * @param {string} meetingId
   * @returns {Promise<{obfToken: string, zoomUserId: string}>}
   */
  async getOBFToken(firebaseUid, meetingId) {
    if (!meetingId) {
      throw new Error("Meeting ID is required to request an OBF token");
    }
    const { accessToken, zoomUserId } = await this.getAccessTokenForUser(firebaseUid);
    functions.logger.info("zoomService", "Fetching OBF token", {
      firebaseUid,
      zoomUserId,
      meetingId,
    });

    const response = await axios.get(
      `${this.baseURL}/users/${encodeURIComponent(zoomUserId)}/token`,
      {
        params: { type: "onbehalf", meeting_id: meetingId },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return { obfToken: response.data.token, zoomUserId };
  }

  /**
   * @param {string} hostFirebaseUid
   * @param {string} meetingId
   * @param {string[]} participantFirebaseUids
   */
  async getMeetingTokens(hostFirebaseUid, meetingId, participantFirebaseUids) {
    const timestamp = new Date().toISOString();
    functions.logger.info("zoomService", "Fetching meeting tokens", {
      hostFirebaseUid,
      meetingId,
      participants: participantFirebaseUids.length,
    });

    const { zakToken, zoomUserId: hostZoomUserId } =
      await this.getZAKToken(hostFirebaseUid);

    const participantResults = await Promise.all(
      participantFirebaseUids.map(async (uid) => {
        try {
          const { obfToken, zoomUserId } = await this.getOBFToken(uid, meetingId);
          return { userId: zoomUserId, obfToken };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          functions.logger.warn("zoomService", "Participant token failed", {
            uid,
            error: message,
          });
          return { userId: uid, error: message };
        }
      })
    );

    const successful = participantResults.filter((r) => "obfToken" in r);
    const failed = participantResults.filter((r) => "error" in r);

    return {
      host: { userId: hostZoomUserId, zakToken },
      participants: successful,
      failed,
      meetingId,
      timestamp,
    };
  }
}

module.exports = { ZoomTokenService };
