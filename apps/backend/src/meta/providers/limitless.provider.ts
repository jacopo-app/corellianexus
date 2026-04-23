const BASE = 'https://play.limitlesstcg.com/api';

export interface LimitlessTournament {
  id: string;
  name: string;
  date: string;
  format: string | null;
  players: number;
  organizerId: number;
}

export interface LimitlessStanding {
  placing: number;
  player: { name: string; country?: string };
  decklist?: {
    leader?: string;
    base?: string;
    cards?: { id: string; count: number }[];
  };
}

export class LimitlessProvider {
  async fetchTournaments(limit = 20): Promise<LimitlessTournament[]> {
    const res = await fetch(`${BASE}/tournaments?game=SWU&limit=${limit}`, {
      headers: { 'User-Agent': 'CorelliaNextus/1.0' },
    });
    if (!res.ok) throw new Error(`Limitless tournaments: ${res.status}`);
    return res.json();
  }

  async fetchStandings(tournamentId: string): Promise<LimitlessStanding[]> {
    const res = await fetch(`${BASE}/tournaments/${tournamentId}/players`, {
      headers: { 'User-Agent': 'CorelliaNexus/1.0' },
    });
    if (!res.ok) throw new Error(`Limitless standings ${tournamentId}: ${res.status}`);
    return res.json();
  }
}
