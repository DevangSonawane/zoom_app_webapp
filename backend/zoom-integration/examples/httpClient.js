/**
 * Example HTTP Client for Zoom Token Distribution API
 * Demonstrates how to use REST endpoints to get tokens
 * 
 * Usage: node examples/httpClient.js
 */

const axios = require('axios');

class ZoomTokenHTTPClient {
  constructor(baseURL = 'http://localhost:3000') {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Check server health
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/api/health');
      console.log('✅ Server health check passed');
      console.log(`   Status: ${response.data.status}`);
      console.log(`   Zoom: ${response.data.zoom}`);
      return response.data;
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      throw error;
    }
  }

  /**
   * Start a meeting (get ZAK token for host)
   */
  async startMeeting(meetingId, hostUserId) {
    try {
      console.log(`\n📞 Starting meeting: ${meetingId}`);
      console.log(`   Host: ${hostUserId}`);

      const response = await this.client.post('/api/meetings/start', {
        meetingId,
        hostUserId
      });

      console.log('✅ Meeting started successfully');
      console.log(`   ZAK Token: ${response.data.zakToken.substring(0, 30)}...`);
      console.log(`   Expires In: ${response.data.expiresIn}`);

      return response.data;
    } catch (error) {
      console.error('❌ Failed to start meeting:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Join a meeting (get OBF token for participant)
   */
  async joinMeeting(meetingId, participantUserId) {
    try {
      console.log(`\n👤 Joining meeting: ${meetingId}`);
      console.log(`   Participant: ${participantUserId}`);

      const response = await this.client.post('/api/meetings/join', {
        meetingId,
        participantUserId
      });

      console.log('✅ Join credentials received');
      console.log(`   OBF Token: ${response.data.obfToken.substring(0, 30)}...`);
      console.log(`   Expires In: ${response.data.expiresIn}`);

      return response.data;
    } catch (error) {
      console.error('❌ Failed to join meeting:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Batch join (get OBF tokens for multiple participants)
   */
  async batchJoin(meetingId, participantUserIds) {
    try {
      console.log(`\n👥 Batch join for ${participantUserIds.length} participants`);

      const response = await this.client.post('/api/meetings/batch-join', {
        meetingId,
        participantUserIds
      });

      console.log('✅ Batch join completed');
      console.log(`   Successful: ${response.data.summary.successful}`);
      console.log(`   Failed: ${response.data.summary.failed}`);

      return response.data;
    } catch (error) {
      console.error('❌ Batch join failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Complete meeting setup (get all tokens at once)
   */
  async setupMeeting(meetingId, hostUserId, participantUserIds = []) {
    try {
      console.log(`\n🎬 Setting up complete meeting`);
      console.log(`   Meeting ID: ${meetingId}`);
      console.log(`   Host: ${hostUserId}`);
      console.log(`   Participants: ${participantUserIds.length}`);

      const response = await this.client.post('/api/meetings/setup', {
        meetingId,
        hostUserId,
        participantUserIds
      });

      console.log('✅ Meeting setup complete');
      console.log(`   Host ZAK: ${response.data.host.zakToken.substring(0, 30)}...`);
      console.log(`   Participant tokens: ${response.data.participants.length}`);
      console.log(`   Failed: ${response.data.failed.length}`);

      return response.data;
    } catch (error) {
      console.error('❌ Meeting setup failed:', error.response?.data || error.message);
      throw error;
    }
  }
}

// =================================================================
// EXAMPLE USAGE
// =================================================================

async function runExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           HTTP Client Examples - REST API                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const client = new ZoomTokenHTTPClient('http://localhost:3000');

  try {
    // Example 1: Check server health
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('EXAMPLE 1: Health Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await client.checkHealth();

    // Example 2: Start a meeting (host workflow)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('EXAMPLE 2: Start Meeting (Host Workflow)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const startResult = await client.startMeeting('1234567890', 'host@example.com');
    console.log('\n📋 Full Response:');
    console.log(JSON.stringify(startResult, null, 2));

    // Example 3: Join a meeting (participant workflow)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('EXAMPLE 3: Join Meeting (Participant Workflow)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const joinResult = await client.joinMeeting('1234567890', 'participant@example.com');
    console.log('\n📋 Full Response:');
    console.log(JSON.stringify(joinResult, null, 2));

    // Example 4: Batch join multiple participants
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('EXAMPLE 4: Batch Join (Multiple Participants)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const batchResult = await client.batchJoin('1234567890', [
      'user1@example.com',
      'user2@example.com',
      'user3@example.com'
    ]);
    console.log('\n📋 Full Response:');
    console.log(JSON.stringify(batchResult, null, 2));

    // Example 5: Complete meeting setup
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('EXAMPLE 5: Complete Meeting Setup (All-in-One)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const setupResult = await client.setupMeeting(
      '9876543210',
      'admin@example.com',
      ['alice@example.com', 'bob@example.com']
    );
    console.log('\n📋 Full Response:');
    console.log(JSON.stringify(setupResult, null, 2));

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  ✅ ALL EXAMPLES COMPLETED                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('\n❌ Example failed:', error.message);
    console.error('\n🔧 Make sure:');
    console.error('   1. The server is running (npm start)');
    console.error('   2. Your .env file has valid Zoom credentials');
    console.error('   3. The server is accessible at http://localhost:3000');
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples();
}

module.exports = ZoomTokenHTTPClient;
