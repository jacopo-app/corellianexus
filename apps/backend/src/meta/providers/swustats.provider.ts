const BASE = 'https://www.swustats.net/TCGEngine/Stats';
const APIS = 'https://www.swustats.net/TCGEngine/APIs';

export interface SwuStatsLeader {
  leaderID: string;
  leaderTitle: string;
  leaderSubtitle: string;
  baseID: string;
  baseTitle: string;
  baseSubtitle: string | null;
  numPlays: number;
  winRate: string;
  avgTurnsInWins: number | null;
  avgTurnsInLosses: number | null;
  avgCardsResourcedInWins: number | null;
  avgRemainingHealthInWins: number | null;
}

export interface SwuStatsCard {
  cardUid: string;
  cardName: string | null;
  timesIncluded: number;
  timesIncludedInWins: number;
  percentIncludedInWins: string;
  timesPlayed: number;
  timesPlayedInWins: number;
  percentPlayedInWins: string;
  timesResourced: number;
  timesResourcedInWins: number;
  percentResourcedInWins: string;
}

export interface SwuStatsTournament {
  id: number;
  name: string;
  date: string;
  link: number;
  melee_url: string;
}

export interface SwuStatsDeckStanding {
  id: number;
  player: string;
  meleeId: string;
  leader: { uuid: string; name: string };
  base: { uuid: string; name: string };
  rank: number;
  standings: {
    match_record: string;
    match_wins: number;
    match_losses: number;
    match_draws: number;
    match_win_rate: number;
    game_record: string;
    game_wins: number;
    game_losses: number;
    game_draws: number;
    game_win_rate: number;
  };
  points: number;
  tiebreakers: { omwp: number; tgwp: number; ogwp: number };
}

export interface SwuStatsTournamentDetail {
  id: number;
  name: string;
  date: string;
  melee_url: string;
  decks_count: number;
  decks: SwuStatsDeckStanding[];
}

export class SwuStatsProvider {
  async fetchTournaments(limit = 50): Promise<SwuStatsTournament[]> {
    const res = await fetch(`${APIS}/GetMeleeTournaments.php?limit=${limit}&sort=tournamentDate+DESC`, {
      headers: { 'User-Agent': 'CorelliaNexus/1.0' },
    });
    if (!res.ok) throw new Error(`SWUStats tournaments: ${res.status}`);
    const data = (await res.json()) as { success: boolean; tournaments: SwuStatsTournament[] };
    return data.tournaments ?? [];
  }

  async fetchTournamentDetail(id: number): Promise<SwuStatsTournamentDetail | null> {
    const res = await fetch(`${APIS}/GetMeleeTournament.php?id=${id}`, {
      headers: { 'User-Agent': 'CorelliaNexus/1.0' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; tournament: { id: number; name: string; date: string; melee_url: string }; decks_count: number; decks: SwuStatsDeckStanding[] };
    if (!data.success) return null;
    return {
      id: data.tournament.id,
      name: data.tournament.name,
      date: data.tournament.date,
      melee_url: data.tournament.melee_url,
      decks_count: data.decks_count,
      decks: data.decks ?? [],
    };
  }

  async fetchLeaderStats(): Promise<SwuStatsLeader[]> {
    const res = await fetch(`${BASE}/DeckMetaStatsAPI.php`, {
      headers: { 'User-Agent': 'CorelliaNexus/1.0' },
    });
    if (!res.ok) throw new Error(`SWUStats leaders: ${res.status}`);
    return res.json();
  }

  async fetchCardStats(): Promise<SwuStatsCard[]> {
    const res = await fetch(`${BASE}/CardMetaStatsAPI.php`, {
      headers: { 'User-Agent': 'CorelliaNexus/1.0' },
    });
    if (!res.ok) throw new Error(`SWUStats cards: ${res.status}`);
    return res.json();
  }
}
