/**
 * Express API Routes for Zoom Token Distribution
 * Provides endpoints for host and participant token retrieval
 */

const express = require('express');
const router = express.Router();

/**
 * POST /api/meetings/start
 * Host initiates a meeting and receives ZAK token
 * 
 * Body:
 * {
 *   "meetingId": "123456789",
 *   "hostUserId": "host@example.com"
 * }
 */
router.post('/meetings/start', async (req, res) => {
  const { meetingId, hostUserId } = req.body;

  // Validation
  if (!meetingId || !hostUserId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: meetingId and hostUserId'
    });
  }

  try {
    console.log(`\n📞 Meeting start request from host: ${hostUserId}`);
    
    // Get ZAK token for host
    const zakToken = await req.app.locals.zoomService.getZAKToken(hostUserId);

    // If WebSocket is available, broadcast to host
    if (req.app.locals.io) {
      req.app.locals.io.to(`user:${hostUserId}`).emit('meeting:started', {
        meetingId,
        zakToken,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 ZAK token broadcasted to host via WebSocket`);
    }

    res.json({
      success: true,
      meetingId,
      zakToken,
      expiresIn: '2 hours',
      message: 'Meeting credentials generated successfully'
    });

  } catch (error) {
    console.error('❌ Error starting meeting:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/meetings/join
 * Participant requests to join a meeting and receives OBF token
 * 
 * Body:
 * {
 *   "meetingId": "123456789",
 *   "participantUserId": "participant@example.com"
 * }
 */
router.post('/meetings/join', async (req, res) => {
  const { meetingId, participantUserId } = req.body;

  // Validation
  if (!meetingId || !participantUserId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: meetingId and participantUserId'
    });
  }

  try {
    console.log(`\n👤 Join request from: ${participantUserId} for meeting: ${meetingId}`);
    
    // Get OBF token for participant
    const obfToken = await req.app.locals.zoomService.getOBFToken(participantUserId, meetingId);

    // If WebSocket is available, broadcast to participant
    if (req.app.locals.io) {
      req.app.locals.io.to(`user:${participantUserId}`).emit('meeting:credentials', {
        meetingId,
        obfToken,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 OBF token broadcasted to participant via WebSocket`);
    }

    res.json({
      success: true,
      meetingId,
      obfToken,
      expiresIn: '30 minutes',
      message: 'Join credentials generated successfully'
    });

  } catch (error) {
    console.error('❌ Error joining meeting:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/meetings/batch-join
 * Distribute OBF tokens to multiple participants at once
 * 
 * Body:
 * {
 *   "meetingId": "123456789",
 *   "participantUserIds": ["user1@example.com", "user2@example.com"]
 * }
 */
router.post('/meetings/batch-join', async (req, res) => {
  const { meetingId, participantUserIds } = req.body;

  // Validation
  if (!meetingId || !Array.isArray(participantUserIds) || participantUserIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid fields: meetingId and participantUserIds (array required)'
    });
  }

  try {
    console.log(`\n👥 Batch join request for ${participantUserIds.length} participants`);
    
    // Fetch OBF tokens for all participants in parallel
    const tokenPromises = participantUserIds.map(async (userId) => {
      try {
        const obfToken = await req.app.locals.zoomService.getOBFToken(userId, meetingId);
        
        // Send via WebSocket if available
        if (req.app.locals.io) {
          req.app.locals.io.to(`user:${userId}`).emit('meeting:credentials', {
            meetingId,
            obfToken,
            timestamp: new Date().toISOString()
          });
        }

        return {
          userId,
          obfToken,
          success: true
        };
      } catch (error) {
        return {
          userId,
          error: error.message,
          success: false
        };
      }
    });

    const results = await Promise.all(tokenPromises);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Successfully issued ${successful.length} tokens`);
    if (failed.length > 0) {
      console.warn(`⚠️  Failed to issue ${failed.length} tokens`);
    }

    res.json({
      success: true,
      meetingId,
      results: {
        successful,
        failed
      },
      summary: {
        total: participantUserIds.length,
        successful: successful.length,
        failed: failed.length
      }
    });

  } catch (error) {
    console.error('❌ Error in batch join:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/meetings/setup
 * One-stop endpoint: Get ZAK for host and OBF for all participants
 * 
 * Body:
 * {
 *   "meetingId": "123456789",
 *   "hostUserId": "host@example.com",
 *   "participantUserIds": ["user1@example.com", "user2@example.com"]
 * }
 */
router.post('/meetings/setup', async (req, res) => {
  const { meetingId, hostUserId, participantUserIds = [] } = req.body;

  // Validation
  if (!meetingId || !hostUserId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: meetingId and hostUserId'
    });
  }

  try {
    console.log(`\n🎬 Complete meeting setup request`);
    
    const tokens = await req.app.locals.zoomService.getMeetingTokens(
      hostUserId,
      meetingId,
      participantUserIds
    );

    // Broadcast to all participants via WebSocket
    if (req.app.locals.io) {
      // Send ZAK to host
      req.app.locals.io.to(`user:${hostUserId}`).emit('meeting:started', {
        meetingId,
        zakToken: tokens.host.zakToken,
        timestamp: tokens.timestamp
      });

      // Send OBF to each participant
      tokens.participants.forEach(participant => {
        req.app.locals.io.to(`user:${participant.userId}`).emit('meeting:credentials', {
          meetingId,
          obfToken: participant.obfToken,
          timestamp: tokens.timestamp
        });
      });

      console.log(`📡 Credentials broadcasted to all users via WebSocket`);
    }

    res.json({
      success: true,
      meetingId,
      host: {
        userId: tokens.host.userId,
        zakToken: tokens.host.zakToken,
        expiresIn: '2 hours'
      },
      participants: tokens.participants.map(p => ({
        userId: p.userId,
        obfToken: p.obfToken,
        expiresIn: '30 minutes'
      })),
      failed: tokens.failed,
      timestamp: tokens.timestamp
    });

  } catch (error) {
    console.error('❌ Error in meeting setup:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    // Test OAuth token retrieval
    await req.app.locals.zoomService.getAccessToken();
    
    res.json({
      success: true,
      status: 'healthy',
      zoom: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      zoom: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
