/**
 * API-Football Provider (v3.football.api-sports.io)
 */

class ApiFootballProvider {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.API_FOOTBALL_KEY || null;
    this.baseUrl = 'https://v3.football.api-sports.io';
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  isAvailable() {
    return !!this.apiKey;
  }

  async fetchTodayFixtures() {
    if (!this.apiKey) return [];
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${this.baseUrl}/fixtures?date=${today}`, {
        headers: {
          'x-apisports-key': this.apiKey,
          'User-Agent': 'Mozilla/5.0'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        console.warn(`[ApiFootball] HTTP error: ${res.status}`);
        return [];
      }

      const data = await res.json();
      const fixtures = data.response || [];

      return fixtures.map(f => {
        const statusShort = f.fixture?.status?.short || 'NS';
        let status = 'UPCOMING';
        if (['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(statusShort)) {
          status = 'LIVE';
        } else if (['FT', 'AET', 'PEN'].includes(statusShort)) {
          status = 'FINISHED';
        }

        return {
          id: `apifootball-${f.fixture.id}`,
          competition: f.league?.name || 'Football',
          competition_logo: f.league?.logo || '',
          home_team: f.teams?.home?.name || 'Home',
          away_team: f.teams?.away?.name || 'Away',
          home_logo: f.teams?.home?.logo || '',
          away_logo: f.teams?.away?.logo || '',
          start_time: f.fixture?.date || new Date().toISOString(),
          status,
          minute: f.fixture?.status?.elapsed ? `${f.fixture.status.elapsed}'` : (status === 'LIVE' ? 'Live' : 'Scheduled'),
          score_home: f.goals?.home ?? 0,
          score_away: f.goals?.away ?? 0,
          broadcasters: (f.lineups || []).flatMap(l => l.broadcaster ? [l.broadcaster] : []),
          source: 'api-football'
        };
      });
    } catch (err) {
      console.error('[ApiFootball] Fetch error:', err.message);
      return [];
    }
  }
}

module.exports = ApiFootballProvider;

