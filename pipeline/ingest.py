#!/usr/bin/env python3
"""
Standalone Stream Data Ingestion Pipeline (Python 3)
Fetches M3U playlists, extracts channel names, country codes, and .m3u8 URLs.
Runs asynchronous HEAD requests every 5 minutes to verify stream health.
Stores active streams in SQLite database (data/streams.db).
"""

import sys
import os
import re
import time
import argparse
import sqlite3
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'streams.db')

DIRECT_SOURCES = [
    {
        "id": "aspor-tr",
        "name": "A Spor (Turkey)",
        "clean_name": "aspor",
        "url": "https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor.m3u8",
        "country": "TR",
        "category": "Sports",
        "logo": "https://i.imgur.com/ZhkZzLf.png",
        "tvg_id": "ASpor.tr",
        "quality": "1080p FHD",
        "source_type": "direct"
    },
    {
        "id": "africa24-sport",
        "name": "Africa 24 Sport",
        "clean_name": "africa24sport",
        "url": "https://africa24.vedge.infomaniak.com/livecast/ik:africa24sport/manifest.m3u8",
        "country": "AFRICA",
        "category": "Sports",
        "logo": "https://i0.wp.com/africa24tv.com/wp-content/uploads/2023/12/LOGO-AFRICASPORT-4-HD-sans-fond.png?fit=512%2C107&ssl=1",
        "tvg_id": "Africa24Sport.fr",
        "quality": "1080p FHD",
        "source_type": "direct"
    },
    {
        "id": "esport3-cat",
        "name": "Esport3 (Spain)",
        "clean_name": "esport3",
        "url": "https://directes-tv-int.3catdirectes.cat/live-content/esport3-hls/master.m3u8",
        "country": "ES",
        "category": "Sports",
        "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Esport3_logo.svg/320px-Esport3_logo.svg.png",
        "tvg_id": "Esport3.es",
        "quality": "1080p FHD",
        "source_type": "direct"
    },
    {
        "id": "bahrain-sports-1",
        "name": "Bahrain Sports 1",
        "clean_name": "bahrainsports1",
        "url": "https://5c7b683162943.streamlock.net/live/ngrp:sportsone_all/playlist.m3u8",
        "country": "BH",
        "category": "Sports",
        "logo": "https://upload.wikimedia.org/wikipedia/en/2/23/Bahrain_Sports_Channel_logo.png",
        "tvg_id": "BahrainSports1.bh",
        "quality": "720p HD",
        "source_type": "direct"
    },
    {
        "id": "bahrain-sports-2",
        "name": "Bahrain Sports 2",
        "clean_name": "bahrainsports2",
        "url": "https://5c7b683162943.streamlock.net/live/ngrp:bahrainsportstwo_all/playlist.m3u8",
        "country": "BH",
        "category": "Sports",
        "logo": "https://upload.wikimedia.org/wikipedia/en/2/23/Bahrain_Sports_Channel_logo.png",
        "tvg_id": "BahrainSports2.bh",
        "quality": "720p HD",
        "source_type": "direct"
    },
    {
        "id": "turkmenistan-sport",
        "name": "Turkmenistan Sport",
        "clean_name": "turkmenistansport",
        "url": "https://alpha.tv.online.tm/legacyhls/ch004_720/index.m3u8",
        "country": "TM",
        "category": "Sports",
        "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f9/Turkmenistan_Sport_logo.png/240px-Turkmenistan_Sport_logo.png",
        "tvg_id": "TurkmenistanSport.tm",
        "quality": "720p HD",
        "source_type": "direct"
    },
    {
        "id": "redbull-tv-sports",
        "name": "Red Bull TV Sports",
        "clean_name": "redbulltvsports",
        "url": "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master_3360.m3u8",
        "country": "GLOBAL",
        "category": "Sports",
        "logo": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f5/Red_Bull_TV_logo.svg/320px-Red_Bull_TV_logo.svg.png",
        "tvg_id": "RedBullTV.at",
        "quality": "1080p FHD",
        "source_type": "direct"
    }
]

PLAYLISTS = [
    {
        "name": "Ethiopian Feeds",
        "url": "https://iptv-org.github.io/iptv/countries/et.m3u",
        "country": "ET",
        "category": "Ethiopian TV"
    },
    {
        "name": "Global Sports Index",
        "urls": [
            "https://iptv-org.github.io/iptv/categories/sports.m3u",
            "https://iptv-org.github.io/iptv/categories/sport.m3u"
        ],
        "country": "GLOBAL",
        "category": "Sports"
    }
]


def init_db(db_path=DB_PATH):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("""
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
        status TEXT DEFAULT 'pending',
        http_status INTEGER DEFAULT 0,
        response_time_ms INTEGER DEFAULT 0,
        cors_supported INTEGER DEFAULT 0,
        last_checked_at TEXT,
        last_online_at TEXT,
        fail_count INTEGER DEFAULT 0
      );
    """)
    cur.execute("""
      CREATE TABLE IF NOT EXISTS health_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checked_at TEXT NOT NULL,
        total INTEGER DEFAULT 0,
        active INTEGER DEFAULT 0,
        offline INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        details TEXT
      );
    """)
    conn.commit()
    return conn


def seed_direct_sources(conn):
    cur = conn.cursor()
    for s in DIRECT_SOURCES:
        cur.execute("""
            INSERT INTO streams (
              id, name, clean_name, url, country, category, logo, tvg_id,
              source_type, source_url, quality, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'direct', ?, 'pending')
            ON CONFLICT(url) DO UPDATE SET
              name = excluded.name,
              clean_name = excluded.clean_name,
              country = excluded.country,
              category = excluded.category,
              logo = excluded.logo,
              tvg_id = excluded.tvg_id,
              quality = excluded.quality,
              source_type = 'direct'
        """, (
            s["id"], s["name"], s["clean_name"], s["url"],
            s["country"], s["category"], s["logo"], s["tvg_id"],
            s["source_type"], s["quality"]
        ))
    conn.commit()


def fetch_url(url, timeout=10):
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PythonSportsIngest/1.0"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[!] Warning: Failed to fetch {url}: {e}")
        return None


def parse_m3u(content, default_country="GLOBAL", default_category="Sports", source_url=""):
    streams = []
    lines = content.splitlines()
    curr_meta = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith("#EXTINF:"):
            curr_meta = {
                "tvg_id": "",
                "country": default_country,
                "logo": "",
                "category": default_category,
                "name": "",
                "quality": "HD"
            }

            id_m = re.search(r'tvg-id="([^"]*)"', line, re.I)
            if id_m:
                curr_meta["tvg_id"] = id_m.group(1)

            ctry_m = re.search(r'tvg-country="([^"]*)"', line, re.I)
            if ctry_m:
                curr_meta["country"] = ctry_m.group(1).upper()
            elif curr_meta["country"] == "GLOBAL" and "." in curr_meta["tvg_id"]:
                code_m = re.search(r'\.([a-z]{2})@?', curr_meta["tvg_id"], re.I)
                if code_m:
                    curr_meta["country"] = code_m.group(1).upper()

            logo_m = re.search(r'tvg-logo="([^"]*)"', line, re.I)
            if logo_m:
                curr_meta["logo"] = logo_m.group(1)

            grp_m = re.search(r'group-title="([^"]*)"', line, re.I)
            if grp_m:
                curr_meta["category"] = grp_m.group(1)

            comma_idx = line.rfind(",")
            if comma_idx != -1:
                curr_meta["name"] = line[comma_idx + 1:].strip()

            if re.search(r'\b(1080p|fhd|4k)\b', curr_meta["name"], re.I):
                curr_meta["quality"] = "1080p FHD"
            elif re.search(r'\b(720p|hd)\b', curr_meta["name"], re.I):
                curr_meta["quality"] = "720p HD"
            elif re.search(r'\b(480p|360p|sd)\b', curr_meta["name"], re.I):
                curr_meta["quality"] = "480p SD"

        elif not line.startswith("#") and (line.startswith("http://") or line.startswith("https://")):
            if curr_meta and curr_meta["name"]:
                clean_name = re.sub(r'[^a-z0-9]', '', curr_meta["name"].lower())
                s_id = f"{clean_name}-{curr_meta['country'].lower()}"[:48]
                streams.append({
                    "id": s_id,
                    "name": curr_meta["name"],
                    "clean_name": clean_name,
                    "url": line,
                    "country": curr_meta["country"],
                    "category": curr_meta["category"],
                    "logo": curr_meta["logo"],
                    "tvg_id": curr_meta["tvg_id"],
                    "quality": curr_meta["quality"],
                    "source_type": "playlist",
                    "source_url": source_url
                })
            curr_meta = None

    return streams


def check_stream_health(item):
    s_id, name, url = item
    t0 = time.time()
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0"},
        method="HEAD"
    )
    cors = 0
    try:
        with urllib.request.urlopen(req, timeout=4.5) as resp:
            elapsed_ms = int((time.time() - t0) * 1000)
            cors_val = resp.headers.get("Access-Control-Allow-Origin")
            if cors_val and ("*" in cors_val or "http" in cors_val):
                cors = 1
            return (s_id, name, "active", resp.status, elapsed_ms, cors)
    except urllib.error.HTTPError as he:
        # Fallback to GET with byte range if HEAD returned 403 or 405
        if he.code in (403, 405):
            try:
                get_req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
                        "Range": "bytes=0-100"
                    }
                )
                with urllib.request.urlopen(get_req, timeout=4.5) as resp:
                    elapsed_ms = int((time.time() - t0) * 1000)
                    cors_val = resp.headers.get("Access-Control-Allow-Origin")
                    if cors_val and ("*" in cors_val or "http" in cors_val):
                        cors = 1
                    return (s_id, name, "active", resp.status, elapsed_ms, cors)
            except Exception:
                pass
        elapsed_ms = int((time.time() - t0) * 1000)
        return (s_id, name, "offline", he.code, elapsed_ms, 0)
    except Exception:
        elapsed_ms = int((time.time() - t0) * 1000)
        return (s_id, name, "offline", 0, elapsed_ms, 0)


def run_pipeline(conn):
    t_start = time.time()
    print("=" * 70)
    print("RUNNING STREAM DATA INGESTION & HEALTH CHECK (Python)")
    print("=" * 70)

    # 1. Seed direct streams
    seed_direct_sources(conn)

    # 2. Fetch Ethiopian feeds
    et_content = fetch_url("https://iptv-org.github.io/iptv/countries/et.m3u")
    if et_content:
        et_streams = parse_m3u(et_content, "ET", "Ethiopian TV", "iptv-org/et.m3u")
        cur = conn.cursor()
        for s in et_streams:
            cur.execute("""
                INSERT INTO streams (id, name, clean_name, url, country, category, logo, tvg_id, source_type, source_url, quality, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                ON CONFLICT(url) DO UPDATE SET name=excluded.name, country=excluded.country, quality=excluded.quality
            """, (s["id"], s["name"], s["clean_name"], s["url"], s["country"], s["category"], s["logo"], s["tvg_id"], s["source_type"], s["source_url"], s["quality"]))
        conn.commit()
        print(f"[*] Ingested {len(et_streams)} Ethiopian streams")

    # 3. Fetch Sports Index
    sports_content = None
    for u in ["https://iptv-org.github.io/iptv/categories/sports.m3u", "https://iptv-org.github.io/iptv/categories/sport.m3u"]:
        sports_content = fetch_url(u)
        if sports_content:
            break

    if sports_content:
        sports_streams = parse_m3u(sports_content, "GLOBAL", "Sports", "iptv-org/sports.m3u")
        cur = conn.cursor()
        # Keep high-priority football & sports channels
        for s in sports_streams[:80]:
            if s["url"].endswith(".m3u8"):
                cur.execute("""
                    INSERT INTO streams (id, name, clean_name, url, country, category, logo, tvg_id, source_type, source_url, quality, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                    ON CONFLICT(url) DO UPDATE SET name=excluded.name, country=excluded.country, quality=excluded.quality
                """, (s["id"], s["name"], s["clean_name"], s["url"], s["country"], s["category"], s["logo"], s["tvg_id"], s["source_type"], s["source_url"], s["quality"]))
        conn.commit()
        print(f"[*] Ingested curated sports streams")

    # 4. Asynchronous HEAD health verification
    cur = conn.cursor()
    cur.execute("SELECT id, name, url FROM streams ORDER BY CASE WHEN source_type='direct' THEN 0 ELSE 1 END")
    rows = cur.fetchall()
    print(f"[*] Verifying health for {len(rows)} streams via async pool...")

    with ThreadPoolExecutor(max_workers=14) as ex:
        results = list(ex.map(check_stream_health, rows))

    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    active_count = 0
    offline_count = 0

    for s_id, name, status, code, ms, cors in results:
        if status == "active":
            active_count += 1
            cur.execute("""
                UPDATE streams SET
                  status = 'active',
                  http_status = ?,
                  response_time_ms = ?,
                  cors_supported = ?,
                  last_checked_at = ?,
                  last_online_at = ?,
                  fail_count = 0
                WHERE id = ?
            """, (code, ms, cors, now_iso, now_iso, s_id))
        else:
            offline_count += 1
            cur.execute("""
                UPDATE streams SET
                  status = 'offline',
                  http_status = ?,
                  response_time_ms = ?,
                  cors_supported = ?,
                  last_checked_at = ?,
                  fail_count = fail_count + 1
                WHERE id = ?
            """, (code, ms, cors, now_iso, s_id))

    total_time = int((time.time() - t_start) * 1000)
    cur.execute("""
        INSERT INTO health_checks (checked_at, total, active, offline, duration_ms, details)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (now_iso, len(rows), active_count, offline_count, total_time, json.dumps({"engine": "python_ingest"})))
    conn.commit()

    print(f"[✓] HEALTH CHECK COMPLETE: {active_count} ACTIVE, {offline_count} OFFLINE ({total_time}ms)")
    print("-" * 70)


def main():
    parser = argparse.ArgumentParser(description="M3U Parser & Stream Ingestion Pipeline")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    parser.add_argument("--daemon", action="store_true", help="Run continuously every 5 minutes")
    parser.add_argument("--interval", type=int, default=300, help="Check interval in seconds (default 300 = 5min)")
    args = parser.parse_args()

    conn = init_db()

    if args.daemon:
        print(f"[Daemon] Starting periodic stream health monitor (every {args.interval}s)...")
        while True:
            try:
                run_pipeline(conn)
            except Exception as e:
                print(f"[Error] Pipeline failure: {e}")
            time.sleep(args.interval)
    else:
        run_pipeline(conn)
        conn.close()


if __name__ == "__main__":
    main()

