/**
 * Local SQLite Database Layer
 * Built with node:sqlite (Node 22+)
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'streams.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    clean_name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    country TEXT DEFAULT 'GLOBAL',
    category TEXT DEFAULT 'Sports',
    logo TEXT,
    tvg_id TEXT,
    source_type TEXT DEFAULT 'playlist',
    source_url TEXT,
    quality TEXT DEFAULT 'HD',
    status TEXT DEFAULT 'pending', -- 'active', 'offline', 'pending'
    http_status INTEGER DEFAULT 0,
    response_time_ms INTEGER DEFAULT 0,
    cors_supported INTEGER DEFAULT 0,
    last_checked_at TEXT,
    last_online_at TEXT,
    fail_count INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);
  CREATE INDEX IF NOT EXISTS idx_streams_country ON streams(country);
  CREATE INDEX IF NOT EXISTS idx_streams_clean_name ON streams(clean_name);

  CREATE TABLE IF NOT EXISTS fixtures (
    id TEXT PRIMARY KEY,
    competition TEXT NOT NULL,
    competition_logo TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_logo TEXT,
    away_logo TEXT,
    start_time TEXT NOT NULL,
    status TEXT DEFAULT 'UPCOMING', -- 'LIVE', 'UPCOMING', 'FINISHED'
    minute TEXT,
    score_home INTEGER DEFAULT 0,
    score_away INTEGER DEFAULT 0,
    broadcasters TEXT, -- JSON array
    streams TEXT, -- JSON array of matched stream objects
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
  CREATE INDEX IF NOT EXISTS idx_fixtures_time ON fixtures(start_time);

  CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checked_at TEXT NOT NULL,
    total INTEGER DEFAULT 0,
    active INTEGER DEFAULT 0,
    offline INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT
  );
`);

// Prepared Statements
const stmts = {
  upsertStream: db.prepare(`
    INSERT INTO streams (
      id, name, clean_name, url, country, category, logo, tvg_id,
      source_type, source_url, quality, status, http_status, response_time_ms,
      cors_supported, last_checked_at, last_online_at, fail_count
    ) VALUES (
      @id, @name, @clean_name, @url, @country, @category, @logo, @tvg_id,
      @source_type, @source_url, @quality, @status, @http_status, @response_time_ms,
      @cors_supported, @last_checked_at, @last_online_at, @fail_count
    )
    ON CONFLICT(url) DO UPDATE SET
      name = coalesce(excluded.name, streams.name),
      clean_name = coalesce(excluded.clean_name, streams.clean_name),
      country = coalesce(excluded.country, streams.country),
      category = coalesce(excluded.category, streams.category),
      logo = coalesce(excluded.logo, streams.logo),
      tvg_id = coalesce(excluded.tvg_id, streams.tvg_id),
      quality = coalesce(excluded.quality, streams.quality),
      source_type = CASE WHEN excluded.source_type = 'direct' THEN 'direct' ELSE streams.source_type END
  `),

  updateStreamHealth: db.prepare(`
    UPDATE streams SET
      status = @status,
      http_status = @http_status,
      response_time_ms = @response_time_ms,
      cors_supported = @cors_supported,
      last_checked_at = @last_checked_at,
      last_online_at = CASE WHEN @status = 'active' THEN @last_checked_at ELSE streams.last_online_at END,
      fail_count = CASE WHEN @status = 'active' THEN 0 ELSE streams.fail_count + 1 END
    WHERE id = @id
  `),

  getActiveStreams: db.prepare(`
    SELECT * FROM streams
    WHERE status = 'active'
    ORDER BY
      CASE WHEN source_type = 'direct' THEN 0 ELSE 1 END,
      response_time_ms ASC
  `),

  getAllStreams: db.prepare(`
    SELECT * FROM streams
    ORDER BY
      CASE WHEN source_type = 'direct' THEN 0 ELSE 1 END,
      status = 'active' DESC,
      name ASC
  `),

  getStreamById: db.prepare(`SELECT * FROM streams WHERE id = ?`),
  getStreamByUrl: db.prepare(`SELECT * FROM streams WHERE url = ?`),

  upsertFixture: db.prepare(`
    INSERT INTO fixtures (
      id, competition, competition_logo, home_team, away_team,
      home_logo, away_logo, start_time, status, minute,
      score_home, score_away, broadcasters, streams, updated_at
    ) VALUES (
      @id, @competition, @competition_logo, @home_team, @away_team,
      @home_logo, @away_logo, @start_time, @status, @minute,
      @score_home, @score_away, @broadcasters, @streams, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      competition = excluded.competition,
      competition_logo = coalesce(excluded.competition_logo, fixtures.competition_logo),
      home_team = excluded.home_team,
      away_team = excluded.away_team,
      home_logo = coalesce(excluded.home_logo, fixtures.home_logo),
      away_logo = coalesce(excluded.away_logo, fixtures.away_logo),
      start_time = excluded.start_time,
      status = excluded.status,
      minute = excluded.minute,
      score_home = excluded.score_home,
      score_away = excluded.score_away,
      broadcasters = excluded.broadcasters,
      streams = excluded.streams,
      updated_at = excluded.updated_at
  `),

  getFixtures: db.prepare(`
    SELECT * FROM fixtures
    ORDER BY
      CASE status WHEN 'LIVE' THEN 0 WHEN 'UPCOMING' THEN 1 ELSE 2 END,
      start_time ASC
  `),

  getLiveFixtures: db.prepare(`
    SELECT * FROM fixtures
    WHERE status = 'LIVE'
    ORDER BY start_time ASC
  `),

  insertHealthLog: db.prepare(`
    INSERT INTO health_checks (checked_at, total, active, offline, duration_ms, details)
    VALUES (@checked_at, @total, @active, @offline, @duration_ms, @details)
  `),

  getLatestHealthCheck: db.prepare(`
    SELECT * FROM health_checks ORDER BY id DESC LIMIT 1
  `),

  getSetting: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  setSetting: db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `),

  getCounts: db.prepare(`
    SELECT
      COUNT(*) AS total_streams,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_streams,
      SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) AS offline_streams,
      SUM(CASE WHEN source_type = 'direct' THEN 1 ELSE 0 END) AS direct_streams
    FROM streams
  `)
};

module.exports = {
  db,
  DB_PATH,

  upsertStream(stream) {
    stmts.upsertStream.run({
      id: stream.id,
      name: stream.name,
      clean_name: stream.clean_name || stream.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      url: stream.url,
      country: stream.country || 'GLOBAL',
      category: stream.category || 'Sports',
      logo: stream.logo || '',
      tvg_id: stream.tvg_id || '',
      source_type: stream.source_type || 'playlist',
      source_url: stream.source_url || '',
      quality: stream.quality || 'HD',
      status: stream.status || 'pending',
      http_status: stream.http_status || 0,
      response_time_ms: stream.response_time_ms || 0,
      cors_supported: stream.cors_supported ? 1 : 0,
      last_checked_at: stream.last_checked_at || null,
      last_online_at: stream.last_online_at || null,
      fail_count: stream.fail_count || 0
    });
  },

  updateStreamHealth(id, status, httpStatus, responseTimeMs, corsSupported) {
    const now = new Date().toISOString();
    stmts.updateStreamHealth.run({
      id,
      status,
      http_status: httpStatus || 0,
      response_time_ms: responseTimeMs || 0,
      cors_supported: corsSupported ? 1 : 0,
      last_checked_at: now
    });
  },

  getActiveStreams() {
    return stmts.getActiveStreams.all();
  },

  getAllStreams() {
    return stmts.getAllStreams.all();
  },

  getStreamById(id) {
    return stmts.getStreamById.get(id);
  },

  getStreamByUrl(url) {
    return stmts.getStreamByUrl.get(url);
  },

  upsertFixture(fixture) {
    const now = new Date().toISOString();
    stmts.upsertFixture.run({
      id: fixture.id,
      competition: fixture.competition || 'Football',
      competition_logo: fixture.competition_logo || '',
      home_team: fixture.home_team,
      away_team: fixture.away_team,
      home_logo: fixture.home_logo || '',
      away_logo: fixture.away_logo || '',
      start_time: fixture.start_time,
      status: fixture.status || 'UPCOMING',
      minute: fixture.minute || '',
      score_home: fixture.score_home != null ? fixture.score_home : 0,
      score_away: fixture.score_away != null ? fixture.score_away : 0,
      broadcasters: typeof fixture.broadcasters === 'string' ? fixture.broadcasters : JSON.stringify(fixture.broadcasters || []),
      streams: typeof fixture.streams === 'string' ? fixture.streams : JSON.stringify(fixture.streams || []),
      updated_at: now
    });
  },

  getFixtures(status) {
    if (status === 'LIVE') {
      return stmts.getLiveFixtures.all();
    }
    return stmts.getFixtures.all();
  },

  saveHealthCheckLog(summary) {
    stmts.insertHealthLog.run({
      checked_at: new Date().toISOString(),
      total: summary.total || 0,
      active: summary.active || 0,
      offline: summary.offline || 0,
      duration_ms: summary.duration_ms || 0,
      details: summary.details ? JSON.stringify(summary.details) : null
    });
  },

  getLatestHealthCheck() {
    return stmts.getLatestHealthCheck.get();
  },

  getSetting(key, defaultVal = null) {
    const row = stmts.getSetting.get(key);
    return row ? row.value : defaultVal;
  },

  setSetting(key, val) {
    stmts.setSetting.run(key, String(val), new Date().toISOString());
  },

  getStats() {
    const counts = stmts.getCounts.get();
    const lastCheck = stmts.getLatestHealthCheck.get();
    return {
      totalStreams: counts.total_streams || 0,
      activeStreams: counts.active_streams || 0,
      offlineStreams: counts.offline_streams || 0,
      directStreams: counts.direct_streams || 0,
      lastCheck: lastCheck || null
    };
  }
};

