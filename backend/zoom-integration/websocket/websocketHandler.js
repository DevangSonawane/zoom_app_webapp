/**
 * WebSocket Handler for Real-Time Token Distribution
 *
 * Updated to work with the per-user OAuth ZoomTokenService that takes
 * Firebase UIDs (matching backend/functions/index.js architecture).
 */

const socketIO = require("socket.io");

class WebSocketHandler {
  constructor(server, zoomService) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
      },
    });

    this.zoomService = zoomService;
    this.connectedUsers = new Map(); // firebaseUid -> socketId mapping

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`[ws] Client connected: ${socket.id}`);

      // User authentication/identification (Firebase UID)
      socket.on("authenticate", (data) => {
        const { userId } = data; // This is the Firebase UID
        if (userId) {
          socket.join(`user:${userId}`);
          this.connectedUsers.set(userId, socket.id);
          console.log(`[ws] User authenticated: ${userId} -> ${socket.id}`);

          socket.emit("authenticated", {
            success: true,
            userId,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
          });
        } else {
          socket.emit("error", { message: "userId (Firebase UID) required for authentication" });
        }
      });

      // Host requests to start a meeting (firebaseUid-based)
      socket.on("meeting:start", async (data) => {
        const { meetingId, hostFirebaseUid } = data;

        console.log(`[ws] Meeting start request from ${hostFirebaseUid}`);

        if (!meetingId || !hostFirebaseUid) {
          socket.emit("error", { message: "meetingId and hostFirebaseUid are required" });
          return;
        }

        try {
          const { zakToken, zoomUserId } =
            await this.zoomService.getZAKToken(hostFirebaseUid);

          socket.emit("meeting:started", {
            meetingId,
            host: zoomUserId,
            zakToken,
            timestamp: new Date().toISOString(),
          });

          console.log(`[ws] ZAK token sent to host`);
        } catch (error) {
          console.error(`[ws] Error fetching ZAK token: ${error.message}`);
          socket.emit("error", {
            message: "Failed to start meeting",
            error: error.message,
          });
        }
      });

      // Participant requests to join a meeting (firebaseUid-based)
      socket.on("meeting:join", async (data) => {
        const { meetingId, participantFirebaseUid } = data;

        console.log(`[ws] Join request from ${participantFirebaseUid}`);

        if (!meetingId || !participantFirebaseUid) {
          socket.emit("error", {
            message: "meetingId and participantFirebaseUid are required",
          });
          return;
        }

        try {
          const { obfToken, zoomUserId } = await this.zoomService.getOBFToken(
            participantFirebaseUid,
            meetingId
          );

          socket.emit("meeting:credentials", {
            meetingId,
            participant: zoomUserId,
            obfToken,
            timestamp: new Date().toISOString(),
          });

          console.log(`[ws] OBF token sent to participant`);
        } catch (error) {
          console.error(`[ws] Error fetching OBF token: ${error.message}`);
          socket.emit("error", {
            message: "Failed to join meeting",
            error: error.message,
          });
        }
      });

      // Host distributes tokens to specific participants (firebaseUid-based)
      socket.on("meeting:distribute", async (data) => {
        const { meetingId, hostFirebaseUid, participantFirebaseUids } = data;

        console.log(
          `[ws] Token distribution for ${participantFirebaseUids?.length || 0} participants`
        );

        if (
          !meetingId ||
          !hostFirebaseUid ||
          !Array.isArray(participantFirebaseUids)
        ) {
          socket.emit("error", { message: "Invalid request format" });
          return;
        }

        try {
          const tokens = await this.zoomService.getMeetingTokens(
            hostFirebaseUid,
            meetingId,
            participantFirebaseUids
          );

          // Send ZAK to host
          socket.emit("meeting:started", {
            meetingId,
            host: tokens.host.userId,
            zakToken: tokens.host.zakToken,
            timestamp: tokens.timestamp,
          });

          // Send OBF to each participant if connected
          tokens.participants.forEach((participant) => {
            this.io
              .to(`user:${participant.userId}`)
              .emit("meeting:credentials", {
                meetingId,
                participant: participant.userId,
                obfToken: participant.obfToken,
                timestamp: tokens.timestamp,
              });
          });

          // Notify host of distribution status
          socket.emit("meeting:distributed", {
            meetingId,
            successful: tokens.participants.length,
            failed: tokens.failed.length,
            failedUsers: tokens.failed.map((f) => f.userId),
            timestamp: tokens.timestamp,
          });

          console.log(
            `[ws] Tokens distributed to ${tokens.participants.length} participants`
          );
        } catch (error) {
          console.error(`[ws] Error distributing tokens: ${error.message}`);
          socket.emit("error", {
            message: "Failed to distribute tokens",
            error: error.message,
          });
        }
      });

      // Ping/pong for connection health
      socket.on("ping", () => {
        socket.emit("pong", { timestamp: new Date().toISOString() });
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log(`[ws] Client disconnected: ${socket.id}`);

        for (const [userId, socketId] of this.connectedUsers.entries()) {
          if (socketId === socket.id) {
            this.connectedUsers.delete(userId);
            console.log(`[ws] Removed user: ${userId}`);
            break;
          }
        }
      });
    });

    console.log("[ws] WebSocket server initialized");
  }

  sendToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  broadcast(event, data) {
    this.io.emit(event, data);
  }

  getConnectedUserCount() {
    return this.connectedUsers.size;
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  getIO() {
    return this.io;
  }
}

module.exports = WebSocketHandler;
