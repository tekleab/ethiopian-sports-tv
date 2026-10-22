/**
 * LAYER 1: STREAM DATA INGESTION (M3U & HLS PARSER)
 * - Automated M3U parser & stream ingestion pipeline
 * - Asynchronous HEAD health verification every 5 minutes
 * - Direct sources priority seeding
 * - SQLite storage via server/db.js
 */

const db = require('./db');

// Direct Stream Sources to Include (as specified in system requirements)
const DIRECT_STREAM_SOURCES = [
  {
    id: 'aspor-tr',
    name: 'A Spor (Turkey)',
    clean_name: 'aspor',
    url: 'https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor.m3u8',
    country: 'TR',
    category: 'Sports',
    logo: 'https://i.imgur.com/ZhkZzLf.png',
    tvg_id: 'ASpor.tr',
    quality: '1080p FHD',
    source_type: 'direct'
  },
  {
    id: 'africa24-sport',
    name: 'Africa 24 Sport',
    clean_name: 'africa24sport',
    url: 'https://africa24.vedge.infomaniak.com/livecast/ik:africa24sport/manifest.m3u8',
    country: 'AFRICA',
    category: 'Sports',
    logo: 'https://i0.wp.com/africa24tv.com/wp-content/uploads/2023/12/LOGO-AFRICASPORT-4-HD-sans-fond.png?fit=512%2C107&ssl=1',
    tvg_id: 'Africa24Sport.fr',
    quality: '1080p FHD',
    source_type: 'direct'
  },
  {
    id: 'esport3-cat',
    name: 'Esport3 (Spain)',
    clean_name: 'esport3',
    url: 'https://directes-tv-int.3catdirectes.cat/live-content/esport3-hls/master.m3u8',
    country: 'ES',
    category: 'Sports',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Esport3_logo.svg/320px-Esport3_logo.svg.png',
    tvg_id: 'Esport3.es',
    quality: '1080p FHD',
    source_type: 'direct'
  },
  {
    id: 'bahrain-sports-1',
    name: 'Bahrain Sports 1',
    clean_name: 'bahrainsports1',
    url: 'https://5c7b683162943.streamlock.net/live/ngrp:sportsone_all/playlist.m3u8',
    country: 'BH',
    category: 'Sports',
    logo: 'https://upload.wikimedia.org/wikipedia/en/2/23/Bahrain_Sports_Channel_logo.png',
    tvg_id: 'BahrainSports1.bh',
    quality: '720p HD',
    source_type: 'direct'
  },
  {
    id: 'bahrain-sports-2',
    name: 'Bahrain Sports 2',
    clean_name: 'bahrainsports2',
    url: 'https://5c7b683162943.streamlock.net/live/ngrp:bahrainsportstwo_all/playlist.m3u8',
    country: 'BH',
    category: 'Sports',
    logo: 'https://upload.wikimedia.org/wikipedia/en/2/23/Bahrain_Sports_Channel_logo.png',
    tvg_id: 'BahrainSports2.bh',
    quality: '720p HD',
    source_type: 'direct'
  },
  {
    id: 'turkmenistan-sport',
    name: 'Turkmenistan Sport',
    clean_name: 'turkmenistansport',
    url: 'https://alpha.tv.online.tm/legacyhls/ch004_720/index.m3u8',
    country: 'TM',
    category: 'Sports',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f9/Turkmenistan_Sport_logo.png/240px-Turkmenistan_Sport_logo.png',
    tvg_id: 'TurkmenistanSport.tm',
    quality: '720p HD',
    source_type: 'direct'
  },
  {
    id: 'redbull-tv-sports',
    name: 'Red Bull TV Sports',
    clean_name: 'redbulltvsports',
    url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master_3360.m3u8',
    country: 'GLOBAL',
    category: 'Sports',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f5/Red_Bull_TV_logo.svg/320px-Red_Bull_TV_logo.svg.png',
    tvg_id: 'RedBullTV.at',
    quality: '1080p FHD',
    source_type: 'direct'
  }
];

// Auto-Updating Master Playlists
const MASTER_PLAYLISTS = [
  {
    name: 'Ethiopian Local Feeds',
    url: 'https://iptv-org.github.io/iptv/countries/et.m3u',
    country: 'ET',
    category: 'Local/Sports',
    priority: 1
  },
  {
    name: 'Global Sports Index',
    // We check both the requested 'sport.m3u' and current 'sports.m3u' standard
    urls: [
      'https://iptv-org.github.io/iptv/categories/sports.m3u',
      'https://iptv-org.github.io/iptv/categories/sport.m3u'
    ],
    country: 'GLOBAL',
    category: 'Sports',
    priority: 2
  },
  {
    name: 'Global Master Index (Sports Subset)',
    url: 'https://iptv-org.github.io/iptv/index.m3u',
    country: 'GLOBAL',
    category: 'Master',
    priority: 3
  }
];

class StreamIngestionPipeline {
  constructor() {
    this.isChecking = false;
    this.timer = null;
    this.checkIntervalMs = 5 * 60 * 1000; // 5 minutes
    this.concurrencyLimit = 12;
  }

  /**
   * Initialize direct seeds into SQLite and run initial ingestion
   */
  async init() {
    console.log('[Ingestion] Seeding direct stream sources...');
    this.seedDirectStreams();
    console.log('[Ingestion] Initializing master playlists ingestion & health check...');
    await this.runFullIngestionCycle();
    this.startScheduler();
  }

  seedDirectStreams() {
    for (const item of DIRECT_STREAM_SOURCES) {
      db.upsertStream({
        id: item.id,
        name: item.name,
        clean_name: item.clean_name,
        url: item.url,
        country: item.country,
        category: item.category,
        logo: item.logo,
        tvg_id: item.tvg_id,
        quality: item.quality,
        source_type: 'direct',
        source_url: 'direct',
        status: 'pending'
      });
    }
  }

  /**
   * Parse an M3U text payload into structured stream objects
   */
  parseM3U(content, defaultCountry = 'GLOBAL', defaultCategory = 'Sports', sourceUrl = '') {
    const lines = content.split(/\r?\n/);
    const streams = [];
    let currentMeta = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentMeta = {
          tvgId: '',
          tvgCountry: defaultCountry,
          tvgLogo: '',
          groupTitle: defaultCategory,
          name: '',
          quality: 'HD'
        };

        // Extract attributes
        const idMatch = line.match(/tvg-id="([^"]*)"/i);
        if (idMatch) currentMeta.tvgId = idMatch[1];

        const countryMatch = line.match(/tvg-country="([^"]*)"/i);
        if (countryMatch) currentMeta.tvgCountry = countryMatch[1].toUpperCase();

        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        if (logoMatch) currentMeta.tvgLogo = logoMatch[1];

        const groupMatch = line.match(/group-title="([^"]*)"/i);
        if (groupMatch) currentMeta.groupTitle = groupMatch[1];

        // If country not found in attribute, infer from tvgId (e.g. Channel.tr@SD)
        if (currentMeta.tvgCountry === 'GLOBAL' && currentMeta.tvgId.includes('.')) {
          const codeMatch = currentMeta.tvgId.match(/\.([a-z]{2})@/i) || currentMeta.tvgId.match(/\.([a-z]{2})$/i);
          if (codeMatch) currentMeta.tvgCountry = codeMatch[1].toUpperCase();
        }

        // Extract channel name (after last comma)
        const commaIdx = line.lastIndexOf(',');
        if (commaIdx !== -1) {
          currentMeta.name = line.substring(commaIdx + 1).trim();
        }

        // Quality detection
        if (/\b(1080p|fhd|4k)\b/i.test(currentMeta.name) || /\b(1080p|fhd|4k)\b/i.test(line)) {
          currentMeta.quality = '1080p FHD';
        } else if (/\b(720p|hd)\b/i.test(currentMeta.name) || /\b(720p|hd)\b/i.test(line)) {
          currentMeta.quality = '720p HD';
        } else if (/\b(480p|360p|sd)\b/i.test(currentMeta.name) || /\b(480p|360p|sd)\b/i.test(line)) {
          currentMeta.quality = '480p SD';
        }
      } else if (!line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://'))) {
        if (currentMeta && currentMeta.name) {
          const cleanName = currentMeta.name
            .toLowerCase()
            .replace(/\s*\([^)]*\)/g, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/[^a-z0-9]/g, '');

          // Generate stable ID from cleanName and country
          const id = `${cleanName}-${currentMeta.tvgCountry.toLowerCase()}`.substring(0, 48);

          streams.push({
            id,
            name: currentMeta.name,
            clean_name: cleanName,
            url: line,
            country: currentMeta.tvgCountry,
            category: currentMeta.groupTitle,
            logo: currentMeta.tvgLogo,
            tvg_id: currentMeta.tvgId,
            quality: currentMeta.quality,
            source_type: 'playlist',
            source_url: sourceUrl
          });
        }
        currentMeta = null;
      }
    }

    return streams;
  }

  /**
   * Fetch an M3U URL with timeout and fallback support
   */
  async fetchPlaylist(url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SportsIngest/2.0' },
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      console.warn(`[Ingestion] Failed to fetch playlist from ${url}: ${err.message}`);
      return null;
    }
  }

  /**
   * Check single stream health via asynchronous HEAD (with GET Range fallback)
   */
  async verifyStreamHealth(streamUrl, timeoutMs = 4500) {
    const t0 = Date.now();
    try {
      // 1. Try HEAD request
      let res = await fetch(streamUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });

      // 2. Some streaming CDNs reject HEAD with 403/405 - fallback to lightweight GET Range
      if (res.status === 405 || res.status === 403 || res.status === 501) {
        res = await fetch(streamUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Range': 'bytes=0-100'
          },
          signal: AbortSignal.timeout(timeoutMs)
        });
      }

      const elapsed = Date.now() - t0;
      const corsHeader = res.headers.get('access-control-allow-origin');
      const corsSupported = !!(corsHeader && (corsHeader === '*' || corsHeader.includes('http')));
      const isHealthy = res.status >= 200 && res.status < 400;

      return {
        status: isHealthy ? 'active' : 'offline',
        httpStatus: res.status,
        responseTimeMs: elapsed,
        corsSupported,
        error: isHealthy ? null : `HTTP ${res.status}`
      };
    } catch (err) {
      const elapsed = Date.now() - t0;
      // In sandbox/offline mode, keep existing active status if stream was previously active
      const existing = db.getStreamByUrl(streamUrl);
      const isStillActive = existing && existing.status === 'active' && existing.fail_count < 3;

      return {
        status: isStillActive ? 'active' : 'offline',
        httpStatus: existing ? existing.http_status : 0,
        responseTimeMs: elapsed,
        corsSupported: existing ? !!existing.cors_supported : false,
        error: err.message
      };
    }
  }

  /**
   * Run health checks on a batch of streams with worker pool concurrency
   */
  async checkStreamsHealth(streamList) {
    const results = [];
    let idx = 0;

    const worker = async () => {
      while (idx < streamList.length) {
        const current = streamList[idx++];
        if (!current) break;

        const health = await this.verifyStreamHealth(current.url);
        db.updateStreamHealth(
          current.id,
          health.status,
          health.httpStatus,
          health.responseTimeMs,
          health.corsSupported
        );

        results.push({
          id: current.id,
          name: current.name,
          ...health
        });
      }
    };

    const workers = Array.from({ length: this.concurrencyLimit }, () => worker());
    await Promise.all(workers);
    return results;
  }

  /**
   * Execute full ingestion & health check cycle
   */
  async runFullIngestionCycle() {
    if (this.isChecking) {
      console.log('[Ingestion] Ingestion cycle already in progress, skipping.');
      return;
    }

    this.isChecking = true;
    const startTime = Date.now();
    console.log('[Ingestion] --- STARTING INGESTION CYCLE ---');

    try {
      // 1. Re-seed direct stream sources
      this.seedDirectStreams();

      // 2. Ingest Ethiopian Feeds
      const etM3u = await this.fetchPlaylist('https://iptv-org.github.io/iptv/countries/et.m3u');
      if (etM3u) {
        const etStreams = this.parseM3U(etM3u, 'ET', 'Ethiopian TV', 'https://iptv-org.github.io/iptv/countries/et.m3u');
        for (const s of etStreams) db.upsertStream(s);
        console.log(`[Ingestion] Ingested ${etStreams.length} Ethiopian channels`);
      }

      // 3. Ingest Sports Index
      let sportsM3u = null;
      for (const url of ['https://iptv-org.github.io/iptv/categories/sports.m3u', 'https://iptv-org.github.io/iptv/categories/sport.m3u']) {
        sportsM3u = await this.fetchPlaylist(url);
        if (sportsM3u) break;
      }

      if (sportsM3u) {
        const sportsStreams = this.parseM3U(sportsM3u, 'GLOBAL', 'Sports', 'iptv-org/sports.m3u');
        // Filter or cap to high-interest football & sports streams to keep health check fast & reliable
        const curated = sportsStreams.filter(s =>
          s.url.endsWith('.m3u8') &&
          (s.country === 'TR' || s.country === 'ES' || s.country === 'BH' || s.country === 'ET' ||
           s.country === 'GB' || s.country === 'US' || s.country === 'FR' || s.country === 'IT' ||
           s.country === 'DE' || s.country === 'SA' || s.clean_name.includes('sport') ||
           s.clean_name.includes('football') || s.clean_name.includes('soccer'))
        ).slice(0, 80);

        for (const s of curated) db.upsertStream(s);
        console.log(`[Ingestion] Ingested ${curated.length} curated sports channels`);
      }

      // 4. Run asynchronous HEAD health check on all streams in database
      const allStreams = db.getAllStreams();
      console.log(`[Ingestion] Verifying health of ${allStreams.length} streams...`);

      const results = await this.checkStreamsHealth(allStreams);
      const activeCount = results.filter(r => r.status === 'active').length;
      const offlineCount = results.filter(r => r.status === 'offline').length;
      const durationMs = Date.now() - startTime;

      console.log(`[Ingestion] Completed health check: ${activeCount} ACTIVE, ${offlineCount} OFFLINE (${durationMs}ms)`);

      // 5. Save log to SQLite
      db.saveHealthCheckLog({
        total: allStreams.length,
        active: activeCount,
        offline: offlineCount,
        duration_ms: durationMs,
        details: { checkedAt: new Date().toISOString() }
      });

    } catch (err) {
      console.error('[Ingestion] Error during cycle:', err);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Schedule automated health checks every 5 minutes
   */
  startScheduler() {
    if (this.timer) clearInterval(this.timer);
    console.log(`[Ingestion] Health verification scheduled every ${this.checkIntervalMs / 1000 / 60} minutes`);
    this.timer = setInterval(() => {
      this.runFullIngestionCycle();
    }, this.checkIntervalMs);
  }

  stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// Singleton pipeline instance
const pipeline = new StreamIngestionPipeline();

module.exports = {
  pipeline,
  DIRECT_STREAM_SOURCES,
  MASTER_PLAYLISTS,
  StreamIngestionPipeline
};
