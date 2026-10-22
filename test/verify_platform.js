/**
 * Complete Platform Verification Test Suite
 * Tests Layer 1, Layer 2, Layer 3 & REST API
 */

const assert = require('node:assert');
const path = require('node:path');
const db = require('../server/db');
const { matchEngine } = require('../server/matchEngine');
const { pipeline, DIRECT_STREAM_SOURCES } = require('../server/streamIngestion');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING PLATFORM VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  // Test 1: SQLite Database Tables and Queries
  console.log('[Test 1] Verifying SQLite Database and Tables...');
  const stats = db.getStats();
  console.log('   Total Streams:', stats.totalStreams);
  console.log('   Active Streams:', stats.activeStreams);
  console.log('   Offline Streams:', stats.offlineStreams);
  console.log('   Direct Streams:', stats.directStreams);
  assert(stats.totalStreams > 0, 'Total streams in SQLite should be > 0');
  assert(stats.activeStreams > 0, 'Active streams in SQLite should be > 0');
  console.log('   ✅ SQLite Database operational and verified.\n');

  // Test 2: Direct Sources Presence
  console.log('[Test 2] Verifying Direct Stream Sources in DB...');
  const activeStreams = db.getActiveStreams();
  const directUrls = DIRECT_STREAM_SOURCES.map(d => d.url);
  const foundDirect = activeStreams.filter(s => directUrls.includes(s.url));
  console.log(`   Found ${foundDirect.length} direct streams active in database.`);
  foundDirect.forEach(s => {
    console.log(`   - ${s.name} (${s.country}): HTTP ${s.http_status} [${s.response_time_ms}ms] Quality: ${s.quality}`);
  });
  assert(foundDirect.length >= 4, 'At least 4 direct stream sources should be verified active');
  console.log('   ✅ Direct stream sources verified.\n');

  // Test 3: Match Matching Engine Logic
  console.log('[Test 3] Verifying Match Matching Engine & Broadcaster Mapping...');
  await matchEngine.refreshMatches();
  const liveMatches = matchEngine.getLiveMatches();
  const allMatches = matchEngine.getAllMatches();

  console.log(`   Live Matches: ${liveMatches.length}`);
  console.log(`   Total Fixtures: ${allMatches.length}`);

  assert(allMatches.length > 0, 'Fixtures count should be > 0');
  assert(liveMatches.length > 0, 'Live matches count should be > 0');

  // Inspect first live match
  const sample = liveMatches[0];
  console.log(`   Sample Match: ${sample.home_team} vs ${sample.away_team} (${sample.competition})`);
  console.log(`   Status: ${sample.status} • Clock: ${sample.minute} • Score: ${sample.score_home} - ${sample.score_away}`);
  console.log(`   Broadcasters: ${JSON.stringify(sample.broadcasters)}`);
  console.log(`   Assigned Stream Servers: ${sample.streams.length}`);

  assert(sample.streams.length > 0, 'Sample live match must have assigned stream servers');
  sample.streams.forEach(st => {
    console.log(`     -> ${st.serverLabel} | Channel: ${st.channelName} | Quality: ${st.quality} | Latency: ${st.latencyMs}ms`);
    assert(st.streamUrl, 'Stream URL must exist');
    assert(st.directUrl, 'Direct URL must exist');
  });
  console.log('   ✅ Match matching engine verified.\n');

  // Test 4: HLS Proxy URL Resolution
  console.log('[Test 4] Verifying Stream Proxy URI Resolution...');
  const { resolveUrl } = require('../server/streamProxy');
  const base = 'https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor.m3u8';
  const relative = 'aspor_1080p.m3u8';
  const resolved = resolveUrl(relative, base);
  assert.strictEqual(resolved, 'https://rnttwmjcin.turknet.ercdn.net/lcpmvefbyo/aspor/aspor_1080p.m3u8');
  console.log(`   Relative URI "${relative}" -> "${resolved}"`);
  console.log('   ✅ HLS Proxy URI resolution verified.\n');

  console.log('====================================================');
  console.log('🎉 ALL PLATFORM TESTS PASSED SUCCESSFULLY (4/4)!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

