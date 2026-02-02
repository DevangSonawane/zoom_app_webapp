/**
 * Main Server Application
 * Zoom Token Distribution System
 * 
 * Compliant with March 2, 2026 security requirements
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const ZoomTokenService = require('./services/zoomTokenService');
const WebSocketHandler = require('./websocket/websocketHandler');
const meetingRoutes = require('./routes/meetingRoutes');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 3000;
const config = {
  clientId: process.env.ZOOM_CLIENT_ID,
  clientSecret: process.env.ZOOM_CLIENT_SECRET,
  accountId: process.env.ZOOM_ACCOUNT_ID
};

// Validate configuration
if (!config.clientId || !config.clientSecret || !config.accountId) {
  console.error('❌ Missing required Zoom credentials in environment variables');
  console.error('   Required: ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_ACCOUNT_ID');
  process.exit(1);
}

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS support
app.use(express.json()); // JSON body parser
app.use(express.urlencoded({ extended: true })); // URL-encoded body parser
app.use(morgan('combined')); // Request logging

// Initialize services
const zoomService = new ZoomTokenService(config);
const wsHandler = new WebSocketHandler(server, zoomService);

// Make services available to routes
app.locals.zoomService = zoomService;
app.locals.io = wsHandler.getIO();

// Routes
app.use('/api', meetingRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Zoom Token Distribution API',
    version: '1.0.0',
    status: 'running',
    compliance: 'March 2, 2026 ready',
    endpoints: {
      health: 'GET /api/health',
      startMeeting: 'POST /api/meetings/start',
      joinMeeting: 'POST /api/meetings/join',
      batchJoin: 'POST /api/meetings/batch-join',
      setupMeeting: 'POST /api/meetings/setup'
    },
    websocket: {
      url: `ws://localhost:${PORT}`,
      events: {
        client: ['authenticate', 'meeting:start', 'meeting:join', 'meeting:distribute', 'ping'],
        server: ['authenticated', 'meeting:started', 'meeting:credentials', 'meeting:distributed', 'error', 'pong']
      }
    },
    documentation: 'https://developers.zoom.us/docs/video-sdk/auth/'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
server.listen(PORT, async () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        Zoom Token Distribution Server Started             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n🚀 Server running on port: ${PORT}`);
  console.log(`📡 WebSocket available at: ws://localhost:${PORT}`);
  console.log(`🌐 HTTP API available at: http://localhost:${PORT}`);
  
  // Test Zoom connection
  try {
    console.log('\n🔐 Testing Zoom OAuth connection...');
    const accessToken = await zoomService.getAccessToken();
    console.log('✅ Successfully authenticated with Zoom');
    console.log(`   Access token obtained (${accessToken.substring(0, 20)}...)`);
  } catch (error) {
    console.error('❌ Failed to authenticate with Zoom:', error.message);
    console.error('   Please check your credentials in .env file');
  }

  console.log('\n📋 Available endpoints:');
  console.log('   GET  /api/health');
  console.log('   POST /api/meetings/start');
  console.log('   POST /api/meetings/join');
  console.log('   POST /api/meetings/batch-join');
  console.log('   POST /api/meetings/setup');
  
  console.log('\n🔌 WebSocket events:');
  console.log('   Client → Server:');
  console.log('      • authenticate');
  console.log('      • meeting:start');
  console.log('      • meeting:join');
  console.log('      • meeting:distribute');
  console.log('   Server → Client:');
  console.log('      • authenticated');
  console.log('      • meeting:started (ZAK token)');
  console.log('      • meeting:credentials (OBF token)');
  console.log('      • meeting:distributed');
  
  console.log('\n⚠️  Security Compliance:');
  console.log('   ✅ March 2, 2026 deadline ready');
  console.log('   ✅ Server-to-Server OAuth implemented');
  console.log('   ✅ ZAK tokens for host authentication');
  console.log('   ✅ OBF tokens with meeting_id scoping');
  console.log('   ✅ No long-term credential storage');
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = { app, server };
