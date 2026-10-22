/**
 * REST API Endpoints Router
 * Serves live matches, active streams, HLS proxy, and health checks
 */

const express = require('express');
const router = express.Router();
const db = require('./db');
const { pipeline, DIRECT_STREAM_SOURCES } = require('./streamIngestion');
const { matchEngine } = require('./matchEngine');
const { handleManifestProxy, handleSegmentProxy } = require('./streamProxy');

/**
 * GET /api/matches/live
 * Primary requirement: Clean REST API endpoint returning live matches with active stream URLs
 */
router.get('/matches/live', (req, res) => {
  try {
    const liveMatches = matchEngine.getLiveMatches();
    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      count: liveMatches.length,
      matches: liveMatches
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/matches
 * Returns all fixtures (live, upcoming, finished)
 */
router.get('/matches', (req, res) => {
  try {
    const { status } = req.query;
    const matches = matchEngine.getAllMatches(status);
    const liveCount = matches.filter(m => m.status === 'LIVE').length;
    const upcomingCount = matches.filter(m => m.status === 'UPCOMING').length;

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      total: matches.length,
      liveCount,
      upcomingCount,
      matches
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/streams
 * Returns streams from SQLite with filtering
 */
router.get('/streams', (req, res) => {
  try {
    const { status, country, search } = req.query;
    let streams = db.getAllStreams();

    if (status) {
      streams = streams.filter(s => s.status === status);
    }
    if (country) {
      streams = streams.filter(s => s.country && s.country.toUpperCase() === country.toUpperCase());
    }
    if (search) {
      const q = search.toLowerCase();
      streams = streams.filter(s => s.name.toLowerCase().includes(q) || s.country.toLowerCase().includes(q));
    }

    res.json({
      status: 'success',
      total: streams.length,
      streams: streams.map(s => ({
        ...s,
        proxyUrl: `/api/proxy/stream.m3u8?url=${encodeURIComponent(s.url)}`
      }))
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/streams/direct
 * Returns the primary direct stream sources with their current health
 */
router.get('/streams/direct', (req, res) => {
  try {
    const directStreams = DIRECT_STREAM_SOURCES.map(source => {
      const dbRow = db.getStreamByUrl(source.url) || db.getStreamById(source.id);
      return {
        ...source,
        status: dbRow ? dbRow.status : 'pending',
        httpStatus: dbRow ? dbRow.http_status : 0,
        responseTimeMs: dbRow ? dbRow.response_time_ms : 0,
        corsSupported: dbRow ? !!dbRow.cors_supported : false,
        lastCheckedAt: dbRow ? dbRow.last_checked_at : null,
        proxyUrl: `/api/proxy/stream.m3u8?url=${encodeURIComponent(source.url)}`
      };
    });

    res.json({
      status: 'success',
      count: directStreams.length,
      streams: directStreams
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/streams/refresh
 * Triggers on-demand ingestion and stream health check
 */
router.post('/streams/refresh', async (req, res) => {
  try {
    // Run in background and respond immediately
    pipeline.runFullIngestionCycle().then(() => {
      matchEngine.refreshMatches();
    });

    res.json({
      status: 'accepted',
      message: 'Ingestion & health check initiated in background',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/health
 * System overview and database statistics
 */
router.get('/health', (req, res) => {
  try {
    const stats = db.getStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      stats
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * HLS Stream & Segment Proxy endpoints
 */
router.get('/proxy/stream.m3u8', handleManifestProxy);
router.get('/proxy/segment', handleSegmentProxy);

/**
 * Configuration & API Keys
 */
router.get('/config', (req, res) => {
  res.json({
    apiFootballKeyConfigured: !!db.getSetting('API_FOOTBALL_KEY'),
    footballDataTokenConfigured: !!db.getSetting('FOOTBALL_DATA_TOKEN'),
    theSportsDbKeyConfigured: !!db.getSetting('THESPORTSDB_KEY')
  });
});

router.post('/config', (req, res) => {
  const { apiFootballKey, footballDataToken, theSportsDbKey } = req.body || {};
  if (apiFootballKey !== undefined) db.setSetting('API_FOOTBALL_KEY', apiFootballKey);
  if (footballDataToken !== undefined) db.setSetting('FOOTBALL_DATA_TOKEN', footballDataToken);
  if (theSportsDbKey !== undefined) db.setSetting('THESPORTSDB_KEY', theSportsDbKey);

  res.json({ status: 'success', message: 'Configuration saved' });
});

module.exports = router;

