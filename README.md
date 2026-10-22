# ET Sports TV — Full-Stack Live Football Streaming & Match Aggregator

A high-performance dual-layer live football streaming platform that combines an automated M3U stream ingestion engine with a real-time match fixture mapping engine and an in-browser HLS player.

---

## 🏗 Platform Architecture

```
                          ┌──────────────────────────────────────────────┐
                          │         LAYER 1: STREAM INGESTION            │
                          │   - Direct Sources (A Spor, Esport3, etc.)   │
                          │   - IPTV Master Playlists (Global, ET)       │
                          │   - Asynchronous HEAD Health Verification    │
                          └──────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
                                     ┌───────────────────────┐
                                     │  Local SQLite Engine  │
                                     │   (data/streams.db)   │
                                     └───────────┬───────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────┐  ┌───────────────────────────────────┐
│     METADATA FIXTURE APIS       │  │   LAYER 2: MATCH MATCHING ENGINE  │
│  - API-Football                 ├──►   - Broadcaster Matching Logic    │
│  - Football-Data.org            │  │   - Multi-Tier Server Allocation  │
│  - TheSportsDB                  │  │     (FHD 1080p / HD 720p / SD)    │
│  - ESPN Live Real-Time Feed     │  │   - Auto-Failover Backup Streams  │
└─────────────────────────────────┘  └───────────────────┬───────────────┘
                                                         │
                                                         ▼
                                     ┌───────────────────────────────────┐
                                     │         REST API ENDPOINTS        │
                                     │  - GET /api/matches/live          │
                                     │  - GET /api/streams/direct        │
                                     │  - GET /api/proxy/stream.m3u8     │
                                     └───────────────────┬───────────────┘
                                                         │
                                                         ▼
                                     ┌───────────────────────────────────┐
                                     │   LAYER 3: FRONTEND VIDEO PLAYER  │
                                     │  - In-Browser HLS.js Player       │
                                     │  - Server Selector (FHD/HD/SD)    │
                                     │  - Zero Ads / Instant Failover    │
                                     └───────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Install & Run
```bash
# Start the full-stack server (Port 3000)
npm start

# Or run with auto-reload
npm run dev
```

### 2. Standalone Python Ingestion Pipeline
```bash
# Run one-off M3U fetch and stream health check
python3 pipeline/ingest.py --once

# Or run as continuous 5-minute daemon
python3 pipeline/ingest.py --daemon --interval 300
```

### 3. Run Verification Test Suite
```bash
npm test
```

---

## 📡 Layer 1: Stream Data Ingestion (M3U & HLS Parser)

### Direct Stream Sources
| Channel | Country | Direct Stream URL | Quality |
| :--- | :---: | :--- | :---: |
| **A Spor** | TR | `https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor.m3u8` | 1080p FHD |
| **Africa 24 Sport** | FR/AF | `https://africa24.vedge.infomaniak.com/livecast/ik:africa24sport/manifest.m3u8` | 1080p FHD |
| **Esport3** | ES | `https://directes-tv-int.3catdirectes.cat/live-content/esport3-hls/master.m3u8` | 1080p FHD |
| **Bahrain Sports 1** | BH | `https://5c7b683162943.streamlock.net/live/ngrp:sportsone_all/playlist.m3u8` | 720p HD |
| **Bahrain Sports 2** | BH | `https://5c7b683162943.streamlock.net/live/ngrp:bahrainsportstwo_all/playlist.m3u8` | 720p HD |
| **Turkmenistan Sport**| TM | `https://alpha.tv.online.tm/legacyhls/ch004_720/index.m3u8` | 720p HD |
| **Red Bull TV Sports**| AT | `https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master_3360.m3u8` | 1080p FHD |

### Master Playlists Ingested
- **Ethiopian Local Feeds**: `https://iptv-org.github.io/iptv/countries/et.m3u`
- **Global Sports Index**: `https://iptv-org.github.io/iptv/categories/sports.m3u`
- **Global Master Index**: `https://iptv-org.github.io/iptv/index.m3u`

### Health Check Pipeline
- Asynchronous HEAD requests (with fallback GET Byte Range 0-100) run every **5 minutes**.
- Evaluates HTTP 200/206 vs timeouts/404s.
- Measures latency (response time in ms) and CORS headers.
- Stores active streams in local SQLite database (`data/streams.db`).

---

## ⚽ Layer 2: Match Matching Engine & Metadata APIs

### Integrated Metadata Providers
1. **API-Football**: `https://v3.football.api-sports.io` (via header `x-apisports-key`)
2. **Football-Data.org**: `https://api.football-data.org/v4/matches` (via header `X-Auth-Token`)
3. **TheSportsDB**: `https://www.thesportsdb.com/api/v1/json/`
4. **ESPN Soccer Live Scoreboard**: Real-time scores, clock minutes, official badges, and broadcaster lists without requiring paid API keys.

### Matching Algorithm
1. **Broadcaster Normalization**: Strips casing, brackets, and common tags (`"A Spor"` ↔ `"aspor"`, `"Esport3"` ↔ `"esport3"`, `"Bahrain Sports"` ↔ `"bahrainsports1"`).
2. **Affinity Mapping**: Competitions like Turkish Süper Lig, Spanish Copa del Rey, CAF Champions League, and AFC matches map to regional primary broadcasters.
3. **Server Assignment**: Each fixture receives 4 stream servers:
   - **Server 1**: Primary Broadcaster (FHD 1080p)
   - **Server 2**: Secondary Broadcaster / Angle (HD 720p)
   - **Server 3**: Low-Bandwidth / Mobile Friendly (SD 480p)
   - **Server 4**: Backup Server / Global Sports Feed

### Clean REST Endpoints
- `GET /api/matches/live` — Returns active live matches mapped to working stream URLs.
- `GET /api/matches` — Returns all fixtures (live, upcoming, finished).
- `GET /api/streams` — Ingested streams from SQLite (filter by `status`, `country`, `search`).
- `GET /api/streams/direct` — Live health status of the 7 core direct sources.
- `POST /api/streams/refresh` — Manually trigger on-demand ingestion and health check.
- `GET /api/health` — System status, total/active stream counts, uptime.
- `GET /api/proxy/stream.m3u8` — HLS manifest proxy with automatic CORS injection.
- `GET /api/proxy/segment` — Streaming proxy for `.ts` media segments.

---

## 📺 Layer 3: Frontend Video Player Web Interface

- **Pure In-Browser Player**: Built with HTML5 and HLS.js. No external apps, no third-party ads, no popups.
- **Server Switching**: Instant toggle between `Server 1 (FHD)`, `Server 2 (HD)`, `Server 3 (SD)`, and `Backup`.
- **Automatic Failover**: If a stream stalls or encounters a CDN disconnect, the player automatically displays a notification banner and switches to the next verified healthy server.
- **Smart CORS Proxy**: Rewrites manifests and segments on the fly to bypass browser CORS and mixed-content restrictions.
- **24/7 TV Channels Section**: Instant access to A Spor, Esport3, Bahrain Sports, Turkmenistan Sport, Red Bull TV Sports, and Ethiopian channels.
- **Health Center Modal**: Live view of all ingested streams, response times, HTTP statuses, and on-demand verification triggers.

