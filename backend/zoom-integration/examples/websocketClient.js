/**
 * Example WebSocket Client for Zoom Token Distribution
 * Demonstrates how to connect and receive tokens in real-time
 * 
 * Usage:
 * - Include this in your frontend application
 * - Or run with Node.js: node examples/websocketClient.js
 */

const io = require('socket.io-client');

class ZoomTokenClient {
  constructor(serverUrl = 'http://localhost:3000') {
    this.socket = io(serverUrl);
    this.userId = null;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Connected to Zoom token server');
      console.log(`   Socket ID: ${this.socket.id}`);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
    });

    // Authentication response
    this.socket.on('authenticated', (data) => {
      console.log('✅ Authenticated with server');
      console.log(`   User ID: ${data.userId}`);
      this.userId = data.userId;
    });

    // Meeting started (ZAK token received)
    this.socket.on('meeting:started', (data) => {
      console.log('\n🎬 Meeting Started - ZAK Token Received');
      console.log(`   Meeting ID: ${data.meetingId}`);
      console.log(`   ZAK Token: ${data.zakToken.substring(0, 30)}...`);
      console.log(`   Expires In: ${data.expiresIn}`);
      console.log(`   Timestamp: ${data.timestamp}`);
      
      // TODO: Use this ZAK token to initialize Zoom Video SDK as host
      this.onMeetingStarted(data);
    });

    // Meeting credentials (OBF token received)
    this.socket.on('meeting:credentials', (data) => {
      console.log('\n👤 Meeting Credentials - OBF Token Received');
      console.log(`   Meeting ID: ${data.meetingId}`);
      console.log(`   OBF Token: ${data.obfToken.substring(0, 30)}...`);
      console.log(`   Expires In: ${data.expiresIn}`);
      console.log(`   Timestamp: ${data.timestamp}`);
      
      // TODO: Use this OBF token to join Zoom meeting as participant
      this.onJoinCredentialsReceived(data);
    });

    // Distribution complete (for host)
    this.socket.on('meeting:distributed', (data) => {
      console.log('\n📤 Token Distribution Complete');
      console.log(`   Meeting ID: ${data.meetingId}`);
      console.log(`   Successful: ${data.successful}`);
      console.log(`   Failed: ${data.failed}`);
      if (data.failedUsers.length > 0) {
        console.log(`   Failed Users: ${data.failedUsers.join(', ')}`);
      }
    });

    // Error events
    this.socket.on('error', (data) => {
      console.error('❌ Server error:', data.message);
      if (data.error) {
        console.error(`   Details: ${data.error}`);
      }
    });

    // Pong response
    this.socket.on('pong', (data) => {
      console.log('🏓 Pong received:', data.timestamp);
    });
  }

  // Authenticate with server
  authenticate(userId) {
    console.log(`\n🔐 Authenticating as: ${userId}`);
    this.socket.emit('authenticate', { userId });
  }

  // Host starts a meeting
  startMeeting(meetingId, hostUserId) {
    console.log(`\n📞 Starting meeting: ${meetingId}`);
    this.socket.emit('meeting:start', {
      meetingId,
      hostUserId
    });
  }

  // Participant joins a meeting
  joinMeeting(meetingId, participantUserId) {
    console.log(`\n👤 Joining meeting: ${meetingId}`);
    this.socket.emit('meeting:join', {
      meetingId,
      participantUserId
    });
  }

  // Host distributes tokens to multiple participants
  distributeTokens(meetingId, hostUserId, participantUserIds) {
    console.log(`\n📤 Distributing tokens for ${participantUserIds.length} participants`);
    this.socket.emit('meeting:distribute', {
      meetingId,
      hostUserId,
      participantUserIds
    });
  }

  // Send ping to test connection
  ping() {
    console.log('🏓 Sending ping...');
    this.socket.emit('ping');
  }

  // Disconnect from server
  disconnect() {
    console.log('\n👋 Disconnecting from server...');
    this.socket.disconnect();
  }

  // Callback when meeting is started (override in your app)
  onMeetingStarted(data) {
    // Example: Initialize Zoom Video SDK with ZAK token
    console.log('   → Implement onMeetingStarted() to handle ZAK token');
    // ZoomVideo.createClient().init(...).join({
    //   token: data.zakToken,
    //   ...
    // });
  }

  // Callback when join credentials are received (override in your app)
  onJoinCredentialsReceived(data) {
    // Example: Join Zoom meeting with OBF token
    console.log('   → Implement onJoinCredentialsReceived() to handle OBF token');
    // ZoomVideo.createClient().init(...).join({
    //   token: data.obfToken,
    //   ...
    // });
  }
}

// =================================================================
// EXAMPLE USAGE
// =================================================================

if (require.main === module) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          WebSocket Client Example - Interactive           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const client = new ZoomTokenClient('http://localhost:3000');

  // Example 1: Host workflow
  setTimeout(() => {
    client.authenticate('host@example.com');
    
    setTimeout(() => {
      client.startMeeting('1234567890', 'host@example.com');
    }, 1000);
  }, 1000);

  // Example 2: Participant workflow
  setTimeout(() => {
    const participantClient = new ZoomTokenClient('http://localhost:3000');
    participantClient.authenticate('participant@example.com');
    
    setTimeout(() => {
      participantClient.joinMeeting('1234567890', 'participant@example.com');
    }, 1000);
  }, 3000);

  // Example 3: Host distributes to multiple participants
  setTimeout(() => {
    client.distributeTokens(
      '1234567890',
      'host@example.com',
      ['user1@example.com', 'user2@example.com', 'user3@example.com']
    );
  }, 5000);

  // Cleanup after 10 seconds
  setTimeout(() => {
    client.disconnect();
    process.exit(0);
  }, 10000);
}

module.exports = ZoomTokenClient;
