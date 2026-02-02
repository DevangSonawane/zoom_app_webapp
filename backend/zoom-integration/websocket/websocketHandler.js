/**
 * WebSocket Handler for Real-Time Token Distribution
 * Allows instant credential delivery to connected clients
 */

const socketIO = require('socket.io');

class WebSocketHandler {
  constructor(server, zoomService) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
      }
    });

    this.zoomService = zoomService;
    this.connectedUsers = new Map(); // userId -> socketId mapping

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`\n🔌 Client connected: ${socket.id}`);

      // User authentication/identification
      socket.on('authenticate', (data) => {
        const { userId } = data;
        if (userId) {
          socket.join(`user:${userId}`);
          this.connectedUsers.set(userId, socket.id);
          console.log(`✅ User authenticated: ${userId} -> ${socket.id}`);
          
          socket.emit('authenticated', {
            success: true,
            userId,
            socketId: socket.id,
            timestamp: new Date().toISOString()
          });
        } else {
          socket.emit('error', { message: 'userId required for authentication' });
        }
      });

      // Host requests to start a meeting
      socket.on('meeting:start', async (data) => {
        const { meetingId, hostUserId } = data;

        console.log(`\n📞 WebSocket: Meeting start request from ${hostUserId}`);

        if (!meetingId || !hostUserId) {
          socket.emit('error', { message: 'meetingId and hostUserId are required' });
          return;
        }

        try {
          const zakToken = await this.zoomService.getZAKToken(hostUserId);

          // Send directly to requesting socket
          socket.emit('meeting:started', {
            meetingId,
            zakToken,
            expiresIn: '2 hours',
            timestamp: new Date().toISOString()
          });

          console.log(`✅ ZAK token sent to host via WebSocket`);
        } catch (error) {
          console.error(`❌ Error fetching ZAK token: ${error.message}`);
          socket.emit('error', {
            message: 'Failed to start meeting',
            error: error.message
          });
        }
      });

      // Participant requests to join a meeting
      socket.on('meeting:join', async (data) => {
        const { meetingId, participantUserId } = data;

        console.log(`\n👤 WebSocket: Join request from ${participantUserId}`);

        if (!meetingId || !participantUserId) {
          socket.emit('error', { message: 'meetingId and participantUserId are required' });
          return;
        }

        try {
          const obfToken = await this.zoomService.getOBFToken(participantUserId, meetingId);

          // Send directly to requesting socket
          socket.emit('meeting:credentials', {
            meetingId,
            obfToken,
            expiresIn: '30 minutes',
            timestamp: new Date().toISOString()
          });

          console.log(`✅ OBF token sent to participant via WebSocket`);
        } catch (error) {
          console.error(`❌ Error fetching OBF token: ${error.message}`);
          socket.emit('error', {
            message: 'Failed to join meeting',
            error: error.message
          });
        }
      });

      // Host distributes tokens to specific participants
      socket.on('meeting:distribute', async (data) => {
        const { meetingId, hostUserId, participantUserIds } = data;

        console.log(`\n👥 WebSocket: Token distribution for ${participantUserIds?.length || 0} participants`);

        if (!meetingId || !hostUserId || !Array.isArray(participantUserIds)) {
          socket.emit('error', { message: 'Invalid request format' });
          return;
        }

        try {
          const tokens = await this.zoomService.getMeetingTokens(
            hostUserId,
            meetingId,
            participantUserIds
          );

          // Send ZAK to host
          socket.emit('meeting:started', {
            meetingId,
            zakToken: tokens.host.zakToken,
            expiresIn: '2 hours',
            timestamp: tokens.timestamp
          });

          // Send OBF to each participant if connected
          tokens.participants.forEach(participant => {
            this.io.to(`user:${participant.userId}`).emit('meeting:credentials', {
              meetingId,
              obfToken: participant.obfToken,
              expiresIn: '30 minutes',
              timestamp: tokens.timestamp
            });
          });

          // Notify host of distribution status
          socket.emit('meeting:distributed', {
            meetingId,
            successful: tokens.participants.length,
            failed: tokens.failed.length,
            failedUsers: tokens.failed.map(f => f.userId),
            timestamp: tokens.timestamp
          });

          console.log(`✅ Tokens distributed to ${tokens.participants.length} participants`);
        } catch (error) {
          console.error(`❌ Error distributing tokens: ${error.message}`);
          socket.emit('error', {
            message: 'Failed to distribute tokens',
            error: error.message
          });
        }
      });

      // Ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        
        // Remove from connected users
        for (const [userId, socketId] of this.connectedUsers.entries()) {
          if (socketId === socket.id) {
            this.connectedUsers.delete(userId);
            console.log(`   Removed user: ${userId}`);
            break;
          }
        }
      });
    });

    console.log('📡 WebSocket server initialized');
  }

  // Broadcast message to specific user
  sendToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Broadcast message to all connected clients
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  // Get connected user count
  getConnectedUserCount() {
    return this.connectedUsers.size;
  }

  // Check if user is connected
  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  getIO() {
    return this.io;
  }
}

module.exports = WebSocketHandler;
