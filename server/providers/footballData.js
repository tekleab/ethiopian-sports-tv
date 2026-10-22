/**
 * Football-Data.org Provider (api.football-data.org/v4/matches)
 */

class FootballDataProvider {
  constructor(apiToken) {
    this.apiToken = apiToken || process.env.FOOTBALL_DATA_TOKEN || null;
    this.baseUrl = 'https://api.football-data.org/v4';
  }

  setToken(token) {
    this.apiToken = token;
  }

  isAvailable() {
    return !!this.apiToken;
  }

  async fetchTodayFixtures() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const headers = { 'User-Agent': 'Mozilla/5.0' };
      if (this.apiToken) {
        headers['X-Auth-Token'] = this.apiToken;
      }

      const res = await fetch(`${this.baseUrl}/matches?dateFrom=${today}&dateTo=${today}`, {
        headers,
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        console.warn(`[FootballData] HTTP error: ${res.status}`);
        return [];
      }

      const data = await res.json();
      const matches = data.matches || [];

      return matches.map(m => {
        let status = 'UPCOMING';
        if (['IN_PLAY', 'PAUSED'].includes(m.status)) {
          status = 'LIVE';
        } else if (['FINISHED', 'AWARDED'].includes(m.status)) {
          status = 'FINISHED';
        }

        return {
          id: `footballdata-${m.id}`,
          competition: m.competition?.name || 'Football',
          competition_logo: m.competition?.emblem || '',
          home_team: m.homeTeam?.name || 'Home',
          away_team: m.awayTeam?.name || 'Away',
          home_logo: m.homeTeam?.crest || '',
          away_logo: m.awayTeam?.crest || '',
          start_time: m.utcDate || new Date().toISOString(),
          status,
          minute: status === 'LIVE' ? (m.status === 'PAUSED' ? 'HT' : 'LIVE') : 'Scheduled',
          score_home: m.score?.fullTime?.home ?? 0,
          score_away: m.score?.fullTime?.away ?? 0,
          broadcasters: [],
          source: 'football-data.org'
        };
      });
    } catch (err) {
      console.error('[FootballData] Fetch error:', err.message);
      return [];
    }
  }
}

module.exports = FootballDataProvider;

