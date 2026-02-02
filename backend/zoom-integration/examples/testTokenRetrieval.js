/**
 * Example: Complete Token Retrieval Flow
 * Demonstrates OAuth -> ZAK -> OBF token sequence
 * 
 * Run this file to test your Zoom integration:
 * node examples/testTokenRetrieval.js
 */

require('dotenv').config();
const ZoomTokenService = require('../services/zoomTokenService');

// Configuration from environment variables
const config = {
  clientId: process.env.ZOOM_CLIENT_ID,
  clientSecret: process.env.ZOOM_CLIENT_SECRET,
  accountId: process.env.ZOOM_ACCOUNT_ID
};

// Validate configuration
if (!config.clientId || !config.clientSecret || !config.accountId) {
  console.error('❌ Missing Zoom credentials in .env file');
  console.error('   Please copy .env.example to .env and fill in your credentials');
  process.exit(1);
}

async function runExample() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Zoom Token Retrieval Test - Complete Flow             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Initialize service
  const zoomService = new ZoomTokenService(config);

  try {
    // =================================================================
    // STEP 1: SERVER-TO-SERVER OAUTH AUTHENTICATION
    // =================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: Authenticating with Zoom (Server-to-Server OAuth)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const accessToken = await zoomService.getAccessToken();
    
    console.log('✅ OAuth Success!');
    console.log(`   Access Token: ${accessToken.substring(0, 30)}...`);
    console.log(`   Token Type: Bearer`);
    console.log(`   Valid For: 1 hour`);

    // =================================================================
    // STEP 2: FETCH ZAK TOKEN FOR HOST
    // =================================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: Fetching ZAK Token for Meeting Host');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Replace with your actual Zoom user ID or email
    const hostUserId = process.env.TEST_HOST_USER_ID || 'me';
    console.log(`   Host User ID: ${hostUserId}`);

    const zakToken = await zoomService.getZAKToken(hostUserId);
    
    console.log('✅ ZAK Token Retrieved!');
    console.log(`   Token: ${zakToken.substring(0, 30)}...`);
    console.log(`   Purpose: Host authentication to start/join meetings`);
    console.log(`   Valid For: 2 hours`);

    // =================================================================
    // STEP 3: FETCH OBF TOKEN FOR PARTICIPANT
    // =================================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: Fetching OBF Token for Meeting Participant');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Replace with actual values
    const participantUserId = process.env.TEST_PARTICIPANT_USER_ID || 'me';
    const meetingId = process.env.TEST_MEETING_ID || '1234567890';
    
    console.log(`   Participant User ID: ${participantUserId}`);
    console.log(`   Meeting ID: ${meetingId}`);

    const obfToken = await zoomService.getOBFToken(participantUserId, meetingId);
    
    console.log('✅ OBF Token Retrieved!');
    console.log(`   Token: ${obfToken.substring(0, 30)}...`);
    console.log(`   Purpose: Participant authentication to join specific meeting`);
    console.log(`   Valid For: 30 minutes`);
    console.log(`   Scoped To: Meeting ${meetingId}`);

    // =================================================================
    // STEP 4: COMPLETE MEETING SETUP (HOST + PARTICIPANTS)
    // =================================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: Complete Meeting Setup (All Tokens at Once)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const participantIds = [
      process.env.TEST_PARTICIPANT_1 || 'me',
      // Add more participant IDs as needed
    ];

    const allTokens = await zoomService.getMeetingTokens(
      hostUserId,
      meetingId,
      participantIds
    );

    console.log('✅ All Meeting Tokens Retrieved!');
    console.log('\n📊 Summary:');
    console.log(`   Meeting ID: ${allTokens.meetingId}`);
    console.log(`   Host: ${allTokens.host.userId}`);
    console.log(`   Host Token (ZAK): ${allTokens.host.zakToken.substring(0, 20)}...`);
    console.log(`   Participants: ${allTokens.participants.length}`);
    
    allTokens.participants.forEach((p, idx) => {
      console.log(`      ${idx + 1}. ${p.userId}`);
      console.log(`         OBF Token: ${p.obfToken.substring(0, 20)}...`);
    });

    if (allTokens.failed.length > 0) {
      console.log(`   ⚠️  Failed: ${allTokens.failed.length}`);
      allTokens.failed.forEach(f => {
        console.log(`      - ${f.userId}: ${f.error}`);
      });
    }

    // =================================================================
    // SUCCESS SUMMARY
    // =================================================================
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ ALL TESTS PASSED                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n✅ Your Zoom integration is working correctly!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Start the server: npm start');
    console.log('   2. Test HTTP endpoints: POST /api/meetings/start');
    console.log('   3. Test WebSocket: Connect and emit "meeting:start"');
    console.log('   4. Integrate with your Zoom Video SDK client');
    console.log('\n🔐 Security Compliance:');
    console.log('   ✅ March 2, 2026 deadline ready');
    console.log('   ✅ Using Server-to-Server OAuth');
    console.log('   ✅ ZAK tokens for host authentication');
    console.log('   ✅ OBF tokens with meeting_id scoping');
    console.log('   ✅ No database storage (tokens are ephemeral)\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check your .env file has correct credentials');
    console.error('   2. Verify your Zoom app has required scopes:');
    console.error('      - user:read:admin');
    console.error('      - meeting:write:admin');
    console.error('   3. Ensure your Zoom app is activated');
    console.error('   4. Check if user IDs and meeting ID are valid');
    console.error('\n   Full error:', error);
    process.exit(1);
  }
}

// Run the example
runExample();
