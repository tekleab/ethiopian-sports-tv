/**
 * Main Full-Stack Server
 * - Layer 1: Automated M3U Parser & Stream Ingestion Pipeline (5-min health checks)
 * - Layer 2: Match Matching Engine & Metadata APIs (/api/matches/live)
 * - Layer 3: Frontend Video Player Web Interface & HLS Reverse Proxy
 */

const express = require('express');
const cors = require('cors');
const path = require('node:path');
const apiRoutes = require('./server/routes');
const { pipeline } = require('./server/streamIngestion');
const { matchEngine } = require('./server/matchEngine');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization', 'X-Requested-With', 'x-apisports-key', 'X-Auth-Token']
}));

// Parse JSON request bodies
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Static files (Frontend web app)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname)); // fallback for icons and root files

// SPA fallback for HTML5 routing
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server & Background Engines
async function startServer() {
  const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log('================================================================');
    console.log(`🚀 ET Sports TV Platform running at: http://localhost:${PORT}`);
    console.log(`📡 Stream Health Check Engine: Active (5-min intervals)`);
    console.log(`⚽ Match Scheduling Engine: Active (/api/matches/live)`);
    console.log(`📺 Frontend In-Browser HLS Player: Ready`);
    console.log('================================================================');

    try {
      // Boot Layer 1 Ingestion Pipeline
      await pipeline.init();
      // Boot Layer 2 Match Matching Engine
      await matchEngine.init();
    } catch (err) {
      console.error('[Server] Initialization error:', err);
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    pipeline.stopScheduler();
    matchEngine.stopAutoRefresh();
    server.close(() => {
      console.log('[Server] Closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
