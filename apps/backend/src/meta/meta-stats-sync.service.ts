import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SwuStatsProvider } from './providers/swustats.provider';

const BATCH = 100;

@Injectable()
export class MetaStatsSyncService {
  private readonly logger = new Logger(MetaStatsSyncService.name);
  private swustats = new SwuStatsProvider();

  constructor(private prisma: PrismaService) {}

  async syncAll(): Promise<{ matchups: number; decks: number; cards: number }> {
    const [matchups, decks, cards] = await Promise.all([
      this.syncMatchups(),
      this.syncDeckStats(),
      this.syncCardStats(),
    ]);
    return { matchups, decks, cards };
  }

  // ── Matchup stats ─────────────────────────────────────────────────────────

  async syncMatchups(): Promise<number> {
    this.logger.log('Fetching MetaMatchupStatsAPI…');
    const res = await fetch('https://www.swustats.net/TCGEngine/APIs/MetaMatchupStatsAPI.php', {
      headers: { 'User-Agent': 'CorelliaNexus/1.0' },
    });
    if (!res.ok) throw new Error(`MetaMatchupStatsAPI: ${res.status}`);
    const data = (await res.json()) as {
      leaderID: string; baseID: string; opponentLeaderID: string; opponentBaseID: string;
      numWins: number; numPlays: number; playsGoingFirst: number;
      winsGoingFirst: number; winsGoingSecond: number;
      turnsInWins: number; totalTurns: number;
      cardsResourcedInWins: number; totalCardsResourced: number;
      remainingHealthInWins: number;
    }[];

    this.logger.log(`Upserting ${data.length} matchup rows…`);
    let count = 0;
    for (let i = 0; i < data.length; i += BATCH) {
      const batch = data.slice(i, i + BATCH);
      await Promise.all(
        batch.map((r) =>
          this.prisma.matchupStat.upsert({
            where: {
              leaderID_baseID_opponentLeaderID_opponentBaseID: {
                leaderID: r.leaderID,
                baseID: r.baseID,
                opponentLeaderID: r.opponentLeaderID,
                opponentBaseID: r.opponentBaseID,
              },
            },
            update: {
              numWins: r.numWins, numPlays: r.numPlays,
              playsGoingFirst: r.playsGoingFirst,
              winsGoingFirst: r.winsGoingFirst, winsGoingSecond: r.winsGoingSecond,
              turnsInWins: r.turnsInWins, totalTurns: r.totalTurns,
              cardsResourcedInWins: r.cardsResourcedInWins, totalCardsResourced: r.totalCardsResourced,
              remainingHealthInWins: r.remainingHealthInWins,
            },
            create: {
              leaderID: r.leaderID, baseID: r.baseID,
              opponentLeaderID: r.opponentLeaderID, opponentBaseID: r.opponentBaseID,
              numWins: r.numWins, numPlays: r.numPlays,
              playsGoingFirst: r.playsGoingFirst,
              winsGoingFirst: r.winsGoingFirst, winsGoingSecond: r.winsGoingSecond,
              turnsInWins: r.turnsInWins, totalTurns: r.totalTurns,
              cardsResourcedInWins: r.cardsResourcedInWins, totalCardsResourced: r.totalCardsResourced,
              remainingHealthInWins: r.remainingHealthInWins,
            },
          }),
        ),
      );
      count += batch.length;
    }
    this.logger.log(`Matchups done: ${count}`);
    return count;
  }

  // ── Deck stats ────────────────────────────────────────────────────────────

  async syncDeckStats(): Promise<number> {
    this.logger.log('Fetching DeckMetaStatsAPI…');
    const stats = await this.swustats.fetchLeaderStats();

    let count = 0;
    for (let i = 0; i < stats.length; i += BATCH) {
      const batch = stats.slice(i, i + BATCH);
      await Promise.all(
        batch.map((s) =>
          this.prisma.deckStat.upsert({
            where: { leaderID_baseID: { leaderID: s.leaderID, baseID: s.baseID } },
            update: {
              leaderTitle: s.leaderTitle, leaderSubtitle: s.leaderSubtitle ?? null,
              baseTitle: s.baseTitle, baseSubtitle: s.baseSubtitle ?? null,
              numPlays: s.numPlays,
              winRate: parseFloat(s.winRate),
              avgTurnsInWins: s.avgTurnsInWins != null ? parseFloat(String(s.avgTurnsInWins)) : null,
              avgTurnsInLosses: s.avgTurnsInLosses != null ? parseFloat(String(s.avgTurnsInLosses)) : null,
              avgCardsResourcedInWins: s.avgCardsResourcedInWins != null ? parseFloat(String(s.avgCardsResourcedInWins)) : null,
              avgRemainingHealthInWins: s.avgRemainingHealthInWins != null ? parseFloat(String(s.avgRemainingHealthInWins)) : null,
            },
            create: {
              leaderID: s.leaderID, leaderTitle: s.leaderTitle, leaderSubtitle: s.leaderSubtitle ?? null,
              baseID: s.baseID, baseTitle: s.baseTitle, baseSubtitle: s.baseSubtitle ?? null,
              numPlays: s.numPlays,
              winRate: parseFloat(s.winRate),
              avgTurnsInWins: s.avgTurnsInWins != null ? parseFloat(String(s.avgTurnsInWins)) : null,
              avgTurnsInLosses: s.avgTurnsInLosses != null ? parseFloat(String(s.avgTurnsInLosses)) : null,
              avgCardsResourcedInWins: s.avgCardsResourcedInWins != null ? parseFloat(String(s.avgCardsResourcedInWins)) : null,
              avgRemainingHealthInWins: s.avgRemainingHealthInWins != null ? parseFloat(String(s.avgRemainingHealthInWins)) : null,
            },
          }),
        ),
      );
      count += batch.length;
    }
    this.logger.log(`DeckStats done: ${count}`);
    return count;
  }

  // ── Card stats ────────────────────────────────────────────────────────────

  async syncCardStats(): Promise<number> {
    this.logger.log('Fetching CardMetaStatsAPI…');
    const stats = await this.swustats.fetchCardStats();

    let count = 0;
    for (let i = 0; i < stats.length; i += BATCH) {
      const batch = stats.slice(i, i + BATCH);
      await Promise.all(
        batch.map((s) =>
          this.prisma.cardStat.upsert({
            where: { cardUid: s.cardUid },
            update: {
              cardName: s.cardName ?? null,
              timesIncluded: s.timesIncluded, timesIncludedInWins: s.timesIncludedInWins,
              percentIncludedInWins: parseFloat(s.percentIncludedInWins),
              timesPlayed: s.timesPlayed, timesPlayedInWins: s.timesPlayedInWins,
              percentPlayedInWins: parseFloat(s.percentPlayedInWins),
              timesResourced: s.timesResourced, timesResourcedInWins: s.timesResourcedInWins,
              percentResourcedInWins: parseFloat(s.percentResourcedInWins),
            },
            create: {
              cardUid: s.cardUid, cardName: s.cardName ?? null,
              timesIncluded: s.timesIncluded, timesIncludedInWins: s.timesIncludedInWins,
              percentIncludedInWins: parseFloat(s.percentIncludedInWins),
              timesPlayed: s.timesPlayed, timesPlayedInWins: s.timesPlayedInWins,
              percentPlayedInWins: parseFloat(s.percentPlayedInWins),
              timesResourced: s.timesResourced, timesResourcedInWins: s.timesResourcedInWins,
              percentResourcedInWins: parseFloat(s.percentResourcedInWins),
            },
          }),
        ),
      );
      count += batch.length;
    }
    this.logger.log(`CardStats done: ${count}`);
    return count;
  }
}
