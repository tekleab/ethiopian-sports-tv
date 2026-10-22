/**
 * ESPN Live Soccer Scoreboard Provider
 * Provides free real-time scores, match clock, official badges, and broadcaster metadata
 */

const LEAGUES = [
  { id: 'uefa.europa', name: 'UEFA Europa League' },
  { id: 'uefa.europa.conf', name: 'UEFA Conference League' },
  { id: 'uefa.champions', name: 'UEFA Champions League' },
  { id: 'eng.1', name: 'Premier League' },
  { id: 'esp.1', name: 'La Liga' },
  { id: 'ita.1', name: 'Serie A' },
  { id: 'ger.1', name: 'Bundesliga' },
  { id: 'fra.1', name: 'Ligue 1' },
  { id: 'tur.1', name: 'Turkish Süper Lig' },
  { id: 'caf.champions', name: 'CAF Champions League' },
  { id: 'conmebol.libertadores', name: 'Copa Libertadores' },
  { id: 'conmebol.sudamericana', name: 'Copa Sudamericana' },
  { id: 'ned.1', name: 'Eredivisie' },
  { id: 'por.1', name: 'Primeira Liga' },
  { id: 'bel.1', name: 'Belgian Pro League' },
  { id: 'sco.1', name: 'Scottish Premiership' }
];

class EspnProvider {
  async fetchLeagueFixtures(leagueId, leagueName) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return [];
      const data = await res.json();
      const events = data.events || [];

      return events.map(evt => {
        const comp = (evt.competitions && evt.competitions[0]) || {};
        const competitors = comp.competitors || [];
        const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
        const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};

        // Parse status
        const statusType = evt.status?.type?.name || '';
        const state = evt.status?.type?.state || 'pre';
        let status = 'UPCOMING';
        if (state === 'in') {
          status = 'LIVE';
        } else if (state === 'post' || statusType.includes('FINAL')) {
          status = 'FINISHED';
        }

        const mDate = new Date(evt.date || comp.date);
        const isToday = mDate.toDateString() === new Date().toDateString();
        const dayStr = isToday ? 'Today' : mDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const kickoffDisplay = `${dayStr} • ${timeStr}`;
        const clockDisplay = evt.status?.displayClock ? `${evt.status.displayClock}'` : (status === 'LIVE' ? 'LIVE' : kickoffDisplay);

        // Extract broadcasters
        const broadcasterList = [];
        if (comp.broadcasts) {
          for (const b of comp.broadcasts) {
            if (Array.isArray(b.names)) {
              broadcasterList.push(...b.names);
            }
          }
        }

        return {
          id: `espn-${evt.id}`,
          competition: leagueName,
          competition_logo: data.leagues?.[0]?.logos?.[0]?.href || '',
          home_team: home.team?.displayName || 'Home Team',
          away_team: away.team?.displayName || 'Away Team',
          home_logo: home.team?.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${home.id}.png`,
          away_logo: away.team?.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${away.id}.png`,
          start_time: evt.date || comp.date || new Date().toISOString(),
          status,
          minute: clockDisplay,
          kickoff_formatted: kickoffDisplay,
          score_home: parseInt(home.score, 10) || 0,
          score_away: parseInt(away.score, 10) || 0,
          broadcasters: broadcasterList,
          source: 'espn'
        };
      });
    } catch (err) {
      console.warn(`[ESPN] League ${leagueId} fetch skipped: ${err.message}`);
      return [];
    }
  }

  async fetchAllFixtures() {
    const promises = LEAGUES.map(l => this.fetchLeagueFixtures(l.id, l.name));
    const results = await Promise.all(promises);
    return results.flat();
  }
}

module.exports = EspnProvider;

