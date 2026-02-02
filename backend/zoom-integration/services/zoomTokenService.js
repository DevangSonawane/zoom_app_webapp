/**
 * Zoom Token Service
 * Handles Server-to-Server OAuth and ZAK/OBF token retrieval
 * Compliant with March 2, 2026 security requirements
 */

const axios = require('axios');

class ZoomTokenService {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.accountId = config.accountId;
    
    // In-memory token cache
    this.accessToken = null;
    this.accessTokenExpiry = null;
    
    // Zoom API base URL
    this.baseURL = 'https://api.zoom.us/v2';
    this.oauthURL = 'https://zoom.us/oauth/token';
  }

  /**
   * Step 1: Authenticate with Zoom using Server-to-Server OAuth
   * Returns a cached token if valid, otherwise fetches a new one
   */
  async getAccessToken() {
    // Check if we have a valid cached token (with 5-minute buffer)
    const now = Date.now();
    if (this.accessToken && this.accessTokenExpiry && now < this.accessTokenExpiry - 300000) {
      console.log('✅ Using cached access token');
      return this.accessToken;
    }

    console.log('🔄 Fetching new access token...');

    try {
      // Create Basic Auth header: base64(clientId:clientSecret)
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await axios.post(
        this.oauthURL,
        null, // No body required
        {
          params: {
            grant_type: 'account_credentials',
            account_id: this.accountId
          },
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Token valid for 1 hour (3600 seconds)
      this.accessTokenExpiry = now + (response.data.expires_in * 1000);

      console.log('✅ Access token obtained successfully');
      console.log(`   Expires in: ${response.data.expires_in} seconds`);

      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to obtain access token:', error.response?.data || error.message);
      throw new Error(`OAuth authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Step 2: Fetch ZAK token for meeting host
   * ZAK tokens are valid for 2 hours
   * 
   * @param {string} userId - Zoom user ID or email of the host
   * @returns {Promise<string>} ZAK token
   */
  async getZAKToken(userId) {
    console.log(`🔑 Fetching ZAK token for host: ${userId}`);

    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.get(
        `${this.baseURL}/users/${encodeURIComponent(userId)}/token`,
        {
          params: {
            type: 'zak'
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const zakToken = response.data.token;
      console.log('✅ ZAK token obtained successfully');
      console.log(`   Token length: ${zakToken.length} characters`);

      return zakToken;
    } catch (error) {
      console.error('❌ Failed to fetch ZAK token:', error.response?.data || error.message);
      throw new Error(`ZAK token retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Step 3: Fetch OBF token for meeting participant
   * OBF tokens are valid for 30 minutes and are meeting-specific
   * 
   * @param {string} userId - Zoom user ID or email of the participant
   * @param {string} meetingId - The specific meeting ID to join
   * @returns {Promise<string>} OBF token
   */
  async getOBFToken(userId, meetingId) {
    if (!meetingId) {
      throw new Error('Meeting ID is required for OBF token (compliance requirement)');
    }

    console.log(`🔑 Fetching OBF token for user: ${userId}, meeting: ${meetingId}`);

    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.get(
        `${this.baseURL}/users/${encodeURIComponent(userId)}/token`,
        {
          params: {
            type: 'onbehalf',
            meeting_id: meetingId
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const obfToken = response.data.token;
      console.log('✅ OBF token obtained successfully');
      console.log(`   Token length: ${obfToken.length} characters`);
      console.log(`   Scoped to meeting: ${meetingId}`);

      return obfToken;
    } catch (error) {
      console.error('❌ Failed to fetch OBF token:', error.response?.data || error.message);
      throw new Error(`OBF token retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Utility: Get tokens for both host and participants
   * 
   * @param {string} hostUserId - Host's Zoom user ID
   * @param {string} meetingId - Meeting ID
   * @param {string[]} participantUserIds - Array of participant Zoom user IDs
   * @returns {Promise<Object>} Object containing host ZAK and participant OBF tokens
   */
  async getMeetingTokens(hostUserId, meetingId, participantUserIds = []) {
    console.log(`\n🎯 Fetching tokens for meeting: ${meetingId}`);
    console.log(`   Host: ${hostUserId}`);
    console.log(`   Participants: ${participantUserIds.length}`);

    try {
      // Fetch ZAK token for host
      const zakToken = await this.getZAKToken(hostUserId);

      // Fetch OBF tokens for all participants in parallel
      const obfTokenPromises = participantUserIds.map(userId =>
        this.getOBFToken(userId, meetingId)
          .then(token => ({ userId, token, success: true }))
          .catch(error => ({ userId, error: error.message, success: false }))
      );

      const obfTokenResults = await Promise.all(obfTokenPromises);

      // Separate successful and failed token retrievals
      const successfulTokens = obfTokenResults.filter(r => r.success);
      const failedTokens = obfTokenResults.filter(r => !r.success);

      if (failedTokens.length > 0) {
        console.warn(`⚠️  Failed to fetch tokens for ${failedTokens.length} participant(s)`);
        failedTokens.forEach(f => console.warn(`   - ${f.userId}: ${f.error}`));
      }

      return {
        host: {
          userId: hostUserId,
          zakToken: zakToken
        },
        participants: successfulTokens.map(t => ({
          userId: t.userId,
          obfToken: t.token
        })),
        failed: failedTokens,
        meetingId: meetingId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to fetch meeting tokens:', error.message);
      throw error;
    }
  }

  /**
   * Clear cached tokens (useful for testing or manual refresh)
   */
  clearCache() {
    this.accessToken = null;
    this.accessTokenExpiry = null;
    console.log('🗑️  Token cache cleared');
  }
}

module.exports = ZoomTokenService;
