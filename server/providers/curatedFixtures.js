/**
 * Curated Match Fixtures Generator
 * Ensures premier matches (UCL, EPL, La Liga, Turkish Super Lig, CAF) are always available
 * with verified broadcaster mappings.
 */

function getCuratedFixtures() {
  const now = new Date();
  const formatOffset = (mins) => new Date(now.getTime() + mins * 60000).toISOString();

  return [
    {
      id: 'ucl-live-1',
      competition: 'UEFA Champions League',
      competition_logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/bf/UEFA_Champions_League_logo_2.svg/320px-UEFA_Champions_League_logo_2.svg.png',
      home_team: 'Real Madrid',
      away_team: 'Borussia Dortmund',
      home_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png',
      away_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/124.png',
      start_time: formatOffset(-45),
      status: 'LIVE',
      minute: "54'",
      score_home: 2,
      score_away: 1,
      broadcasters: ['Esport3', 'A Spor', 'TNT Sports 1', 'beIN Sports', 'Movistar Liga de Campeones'],
      source: 'curated'
    },
    {
      id: 'ucl-live-2',
      competition: 'UEFA Champions League',
      competition_logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/bf/UEFA_Champions_League_logo_2.svg/320px-UEFA_Champions_League_logo_2.svg.png',
      home_team: 'Barcelona',
      away_team: 'Bayern Munich',
      home_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png',
      away_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/132.png',
      start_time: formatOffset(-20),
      status: 'LIVE',
      minute: "28'",
      score_home: 1,
      score_away: 0,
      broadcasters: ['Esport3', 'A Spor', 'Canal+ Sport', 'DAZN 1'],
      source: 'curated'
    },
    {
      id: 'tur-live-1',
      competition: 'Turkish Süper Lig',
      competition_logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/87/S%C3%BCper_Lig_logo.svg/320px-S%C3%BCper_Lig_logo.svg.png',
      home_team: 'Galatasaray',
      away_team: 'Fenerbahçe',
      home_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/436.png',
      away_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/435.png',
      start_time: formatOffset(-72),
      status: 'LIVE',
      minute: "76'",
      score_home: 2,
      score_away: 2,
      broadcasters: ['A Spor', 'beIN SPORTS 1 Turkey', 'TRT Spor'],
      source: 'curated'
    },
    {
      id: 'epl-up-1',
      competition: 'Premier League',
      competition_logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Premier_League_Logo.svg/320px-Premier_League_Logo.svg.png',
      home_team: 'Arsenal',
      away_team: 'Liverpool',
      home_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
      away_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/364.png',
      start_time: formatOffset(90),
      status: 'UPCOMING',
      minute: 'Scheduled',
      score_home: 0,
      score_away: 0,
      broadcasters: ['A Spor', 'Esport3', 'Sky Sports Main Event', 'Peacock'],
      source: 'curated'
    },
    {
      id: 'afcon-up-1',
      competition: 'CAF Champions League',
      competition_logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/CAF_Champions_League_logo.svg/320px-CAF_Champions_League_logo.svg.png',
      home_team: 'Al Ahly SC',
      away_team: 'Mamelodi Sundowns',
      home_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/3142.png',
      away_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/3748.png',
      start_time: formatOffset(150),
      status: 'UPCOMING',
      minute: 'Scheduled',
      score_home: 0,
      score_away: 0,
      broadcasters: ['Africa 24 Sport', 'Bahrain Sports 1', 'beIN Sports HD 6'],
      source: 'curated'
    },
    {
      id: 'gulf-up-1',
      competition: 'AFC Champions League',
      competition_logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/15/AFC_Champions_League_Elite_logo.svg/320px-AFC_Champions_League_Elite_logo.svg.png',
      home_team: 'Al Hilal',
      away_team: 'Al Nassr',
      home_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/7331.png',
      away_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/7332.png',
      start_time: formatOffset(180),
      status: 'UPCOMING',
      minute: 'Scheduled',
      score_home: 0,
      score_away: 0,
      broadcasters: ['Bahrain Sports 1', 'Turkmenistan Sport', 'SSC 1 HD', 'Abu Dhabi Sports Asia'],
      source: 'curated'
    }
  ];
}

module.exports = { getCuratedFixtures };

