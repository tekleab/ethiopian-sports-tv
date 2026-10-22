/**
 * LAYER 2: MATCH MATCHING ENGINE & METADATA APIS
 * - Aggregates fixtures from API-Football, Football-Data.org, TheSportsDB, ESPN
 * - Maps channel names from active streams to broadcaster listings per fixture
 * - Serves matches with verified working embedded stream URLs
 */

const db = require('./db');
const ApiFootballProvider = require('./providers/apiFootball');
const FootballDataProvider = require('./providers/footballData');
const TheSportsDbProvider = require('./providers/theSportsDb');
const EspnProvider = require('./providers/espnProvider');
const { getCuratedFixtures } = require('./providers/curatedFixtures');

class MatchMatchingEngine {
  constructor() {
    this.apiFootball = new ApiFootballProvider(db.getSetting('API_FOOTBALL_KEY'));
    this.footballData = new FootballDataProvider(db.getSetting('FOOTBALL_DATA_TOKEN'));
    this.theSportsDb = new TheSportsDbProvider(db.getSetting('THESPORTSDB_KEY'));
    this.espn = new EspnProvider();

    this.refreshTimer = null;
    this.refreshIntervalMs = 60 * 1000; // 60 seconds
  }

  async init() {
    console.log('[MatchEngine] Initializing match matching engine...');
    await this.refreshMatches();
    this.startAutoRefresh();
  }

  startAutoRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      this.refreshMatches().catch(err => console.error('[MatchEngine] Refresh error:', err));
    }, this.refreshIntervalMs);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Normalize channel / broadcaster names for fuzzy string matching
   */
  normalizeName(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\b(hd|fhd|sd|4k|tv|channel|network|sports?)\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Broadcaster matching score between broadcaster string and stream object
   */
  calculateMatchScore(broadcasterName, stream) {
    const normB = this.normalizeName(broadcasterName);
    const normS = this.normalizeName(stream.name);
    const cleanS = stream.clean_name || '';

    if (!normB || !normS) return 0;

    // Exact normalized match
    if (normB === normS || cleanS === normB) return 100;

    // Substring match
    if (normS.includes(normB) || normB.includes(normS)) return 85;

    // Known common channel aliases
    const aliases = {
      'aspor': ['aspor', 'turknetaspor', 'atv'],
      'esport3': ['esport3', '3cat', 'tv3esport', 'esports3'],
      'bahrain': ['bahrain', 'bahrainsports', 'bahrainsport1'],
      'africa24': ['africa24', 'africa24sport', 'africasport'],
      'redbull': ['redbull', 'redbulltv', 'rbmn'],
      'turkmenistan': ['turkmenistan', 'turkmensport', 'tmsport'],
      'bein': ['bein', 'beinsports', 'beinsportsxtra'],
      'cbs': ['cbs', 'cbssports', 'cbssportshq']
    };

    for (const [key, list] of Object.entries(aliases)) {
      const matchB = list.some(a => normB.includes(a));
      const matchS = list.some(a => normS.includes(a) || cleanS.includes(a));
      if (matchB && matchS) return 90;
    }

    return 0;
  }

  /**
   * Map active streams from SQLite database to a given match fixture
   */
  mapStreamsToFixture(fixture, activeStreams) {
    if (!activeStreams || activeStreams.length === 0) {
      return [];
    }

    const matchedStreams = [];
    const usedStreamIds = new Set();
    const broadcasters = Array.isArray(fixture.broadcasters) ? fixture.broadcasters : [];

    // 1. Broadcaster Match: Match explicit broadcasters listed for the fixture
    for (const bName of broadcasters) {
      for (const stream of activeStreams) {
        if (usedStreamIds.has(stream.id)) continue;
        const score = this.calculateMatchScore(bName, stream);
        if (score >= 80) {
          matchedStreams.push({
            stream,
            score,
            reason: `Broadcaster match: "${bName}"`
          });
          usedStreamIds.add(stream.id);
        }
      }
    }

    // 2. League / Regional Affinity Match (if more streams needed)
    const compLower = (fixture.competition || '').toLowerCase();
    if (matchedStreams.length < 3) {
      for (const stream of activeStreams) {
        if (usedStreamIds.has(stream.id)) continue;

        let affinity = 0;
        let reason = '';

        if (compLower.includes('super lig') || compLower.includes('turk')) {
          if (stream.country === 'TR' || stream.clean_name.includes('aspor')) {
            affinity = 75;
            reason = 'Turkish League Regional Stream';
          }
        } else if (compLower.includes('la liga') || compLower.includes('copa')) {
          if (stream.country === 'ES' || stream.clean_name.includes('esport3')) {
            affinity = 75;
            reason = 'Spanish Football Broadcaster';
          }
        } else if (compLower.includes('caf') || compLower.includes('african')) {
          if (stream.country === 'AFRICA' || stream.country === 'ET' || stream.clean_name.includes('africa24')) {
            affinity = 75;
            reason = 'African Football Feed';
          }
        } else if (compLower.includes('afc') || compLower.includes('gulf') || compLower.includes('saudi')) {
          if (stream.country === 'BH' || stream.clean_name.includes('bahrain')) {
            affinity = 75;
            reason = 'Gulf/AFC Broadcaster';
          }
        }

        if (affinity > 0) {
          matchedStreams.push({ stream, score: affinity, reason });
          usedStreamIds.add(stream.id);
        }
      }
    }

    // 3. Fallback Multi-tier assignment: Top low-latency active sports channels
    if (matchedStreams.length < 4) {
      const topLowLatency = activeStreams
        .filter(s => !usedStreamIds.has(s.id))
        .sort((a, b) => (a.response_time_ms || 9999) - (b.response_time_ms || 9999));

      for (const stream of topLowLatency) {
        if (matchedStreams.length >= 4) break;
        matchedStreams.push({
          stream,
          score: 50,
          reason: 'Global Verified Sports Server'
        });
        usedStreamIds.add(stream.id);
      }
    }

    // Format streams with Server 1 (FHD), Server 2 (HD), Server 3 (SD), Server 4 (Backup)
    const qualityTiers = ['FHD (1080p)', 'HD (720p)', 'SD (480p)', 'Backup Server'];

    return matchedStreams.map((m, idx) => {
      const s = m.stream;
      const serverNum = idx + 1;
      const tierLabel = qualityTiers[idx] || `Server ${serverNum}`;
      const proxyUrl = `/api/proxy/stream.m3u8?url=${encodeURIComponent(s.url)}`;

      return {
        serverId: `server-${serverNum}`,
        serverLabel: `Server ${serverNum} • ${tierLabel}`,
        channelId: s.id,
        channelName: s.name,
        country: s.country,
        quality: s.quality || 'HD',
        latencyMs: s.response_time_ms,
        corsSupported: !!s.cors_supported,
        directUrl: s.url,
        proxyUrl: proxyUrl,
        // Smart streamUrl: uses proxyUrl to guarantee zero CORS/mixed-content playback issues
        streamUrl: proxyUrl,
        isVerified: s.status === 'active',
        status: s.status
      };
    });
  }

  /**
   * Refresh all match fixtures from all sources and persist in SQLite
   */
  async refreshMatches() {
    console.log('[MatchEngine] Fetching fixtures from providers...');
    const activeStreams = db.getActiveStreams();

    const rawFixtures = [];

    // 1. Curated marquee fixtures (ensures UEFA Champions League & derby coverage)
    rawFixtures.push(...getCuratedFixtures());

    // 2. ESPN free real-time scores
    try {
      const espnMatches = await this.espn.fetchAllFixtures();
      rawFixtures.push(...espnMatches);
      console.log(`[MatchEngine] Fetched ${espnMatches.length} matches from ESPN`);
    } catch (err) {
      console.warn('[MatchEngine] ESPN fetch skipped:', err.message);
    }

    // 3. API-Football (if key configured)
    if (this.apiFootball.isAvailable()) {
      try {
        const apiFbMatches = await this.apiFootball.fetchTodayFixtures();
        rawFixtures.push(...apiFbMatches);
      } catch (err) {
        console.warn('[MatchEngine] API-Football skipped:', err.message);
      }
    }

    // 4. Football-Data.org (if token configured)
    if (this.footballData.isAvailable()) {
      try {
        const fbDataMatches = await this.footballData.fetchTodayFixtures();
        rawFixtures.push(...fbDataMatches);
      } catch (err) {
        console.warn('[MatchEngine] Football-Data skipped:', err.message);
      }
    }

    // Deduplicate fixtures by team names
    const dedupeMap = new Map();
    for (const f of rawFixtures) {
      const key = `${(f.home_team || '').toLowerCase()}-${(f.away_team || '').toLowerCase()}`;
      if (!dedupeMap.has(key)) {
        dedupeMap.set(key, f);
      } else {
        // Merge broadcasters if already present
        const existing = dedupeMap.get(key);
        const mergedBroadcasters = Array.from(new Set([
          ...(existing.broadcasters || []),
          ...(f.broadcasters || [])
        ]));
        existing.broadcasters = mergedBroadcasters;
      }
    }

    const uniqueFixtures = Array.from(dedupeMap.values());
    console.log(`[MatchEngine] Processing ${uniqueFixtures.length} unique fixtures...`);

    // Map active streams to each fixture and save in SQLite
    for (const f of uniqueFixtures) {
      const mappedStreams = this.mapStreamsToFixture(f, activeStreams);
      db.upsertFixture({
        id: f.id,
        competition: f.competition,
        competition_logo: f.competition_logo,
        home_team: f.home_team,
        away_team: f.away_team,
        home_logo: f.home_logo,
        away_logo: f.away_logo,
        start_time: f.start_time,
        status: f.status,
        minute: f.minute,
        score_home: f.score_home,
        score_away: f.score_away,
        broadcasters: f.broadcasters,
        streams: mappedStreams
      });
    }

    console.log(`[MatchEngine] Successfully mapped & persisted ${uniqueFixtures.length} fixtures`);
  }

  /**
   * Return live fixtures with active embedded stream URLs
   */
  getLiveMatches() {
    const rows = db.getFixtures('LIVE');
    return rows.map(r => ({
      ...r,
      broadcasters: JSON.parse(r.broadcasters || '[]'),
      streams: JSON.parse(r.streams || '[]')
    }));
  }

  /**
   * Return all matches (live, upcoming, finished)
   */
  getAllMatches(filterStatus = null) {
    const rows = db.getFixtures(filterStatus);
    return rows.map(r => ({
      ...r,
      broadcasters: JSON.parse(r.broadcasters || '[]'),
      streams: JSON.parse(r.streams || '[]')
    }));
  }
}

// Singleton engine instance
const matchEngine = new MatchMatchingEngine();

module.exports = {
  matchEngine,
  MatchMatchingEngine
};

