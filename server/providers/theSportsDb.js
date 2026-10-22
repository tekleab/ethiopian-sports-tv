/**
 * TheSportsDB Provider (thesportsdb.com/api/v1/json)
 */

class TheSportsDbProvider {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.THESPORTSDB_KEY || '3';
    this.baseUrl = 'https://www.thesportsdb.com/api/v1/json';
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  async fetchTodayFixtures() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${this.baseUrl}/${this.apiKey}/eventsday.php?d=${today}&s=Soccer`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        console.warn(`[TheSportsDB] HTTP ${res.status}`);
        return [];
      }

      const data = await res.json();
      const events = data.events || [];

      return events.map(e => {
        let status = 'UPCOMING';
        if (e.strStatus === 'Match Finished' || e.strStatus === 'FT') {
          status = 'FINISHED';
        } else if (e.strStatus && (e.strStatus.includes('Half') || e.strStatus.includes('Live') || e.strProgress)) {
          status = 'LIVE';
        }

        return {
          id: `tsdb-${e.idEvent}`,
          competition: e.strLeague || 'Soccer',
          competition_logo: e.strLeagueBadge || '',
          home_team: e.strHomeTeam || 'Home',
          away_team: e.strAwayTeam || 'Away',
          home_logo: e.strHomeTeamBadge || '',
          away_logo: e.strAwayTeamBadge || '',
          start_time: e.strTimestamp || `${e.dateEvent}T${e.strTime || '18:00:00'}Z`,
          status,
          minute: e.strProgress || (status === 'LIVE' ? 'LIVE' : 'Scheduled'),
          score_home: parseInt(e.intHomeScore, 10) || 0,
          score_away: parseInt(e.intAwayScore, 10) || 0,
          broadcasters: (e.strTVStation || '').split(',').map(s => s.trim()).filter(Boolean),
          source: 'thesportsdb'
        };
      });
    } catch (err) {
      console.error('[TheSportsDB] Fetch error:', err.message);
      return [];
    }
  }
}

module.exports = TheSportsDbProvider;

