import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from '../cards/cards.service';

const MIN_RELIABLE_SAMPLE = 5;

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private cardsService: CardsService,
  ) {}

  async getOverview(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { userId },
      select: { result: true },
    });

    const total = matches.length;
    const wins = matches.filter((m) => m.result === 'win').length;

    return {
      totalMatches: total,
      wins,
      losses: total - wins,
      winrate: total > 0 ? Math.round((wins / total) * 100) / 100 : null,
      reliable: total >= MIN_RELIABLE_SAMPLE,
    };
  }

  async getDeckAnalytics(userId: string, deckId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        userId,
        deckVersion: { deckId },
      },
      include: { deckVersion: true, opponentArchetype: true },
    });

    const total = matches.length;
    const wins = matches.filter((m) => m.result === 'win').length;

    // Group by version
    const byVersion: Record<string, { wins: number; total: number; versionNumber: number }> = {};
    for (const m of matches) {
      const key = m.deckVersionId;
      if (!byVersion[key]) {
        byVersion[key] = { wins: 0, total: 0, versionNumber: m.deckVersion.versionNumber };
      }
      byVersion[key].total++;
      if (m.result === 'win') byVersion[key].wins++;
    }

    // Group by matchup
    const byMatchup: Record<string, { name: string; wins: number; total: number }> = {};
    for (const m of matches) {
      const key = m.opponentArchetypeId;
      if (!byMatchup[key]) {
        byMatchup[key] = { name: m.opponentArchetype.name, wins: 0, total: 0 };
      }
      byMatchup[key].total++;
      if (m.result === 'win') byMatchup[key].wins++;
    }

    return {
      deckId,
      totalMatches: total,
      wins,
      losses: total - wins,
      winrate: total > 0 ? Math.round((wins / total) * 100) / 100 : null,
      byVersion: Object.entries(byVersion).map(([id, v]) => ({
        deckVersionId: id,
        versionNumber: v.versionNumber,
        totalMatches: v.total,
        wins: v.wins,
        winrate: v.total > 0 ? Math.round((v.wins / v.total) * 100) / 100 : null,
      })),
      byMatchup: Object.entries(byMatchup).map(([id, v]) => ({
        opponentArchetypeId: id,
        name: v.name,
        totalMatches: v.total,
        wins: v.wins,
        winrate: v.total > 0 ? Math.round((v.wins / v.total) * 100) / 100 : null,
        reliable: v.total >= MIN_RELIABLE_SAMPLE,
      })),
    };
  }

  async getMatchups(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { userId },
      include: { opponentArchetype: true },
      orderBy: { createdAt: 'desc' },
    });

    const byMatchup: Record<string, {
      name: string;
      wins: number;
      total: number;
      latestOpponentDeckVersionId: string | null;
    }> = {};

    for (const m of matches) {
      const key = m.opponentArchetypeId;
      if (!byMatchup[key]) {
        byMatchup[key] = {
          name: m.opponentArchetype.name,
          wins: 0,
          total: 0,
          // First match encountered is the most recent (ordered desc)
          latestOpponentDeckVersionId: m.opponentDeckVersionId ?? null,
        };
      }
      byMatchup[key].total++;
      if (m.result === 'win') byMatchup[key].wins++;
    }

    return Object.entries(byMatchup)
      .map(([id, v]) => ({
        opponentArchetypeId: id,
        name: v.name,
        totalMatches: v.total,
        wins: v.wins,
        losses: v.total - v.wins,
        winrate: v.total > 0 ? Math.round((v.wins / v.total) * 100) / 100 : null,
        reliable: v.total >= MIN_RELIABLE_SAMPLE,
        hasOpponentDeck: v.latestOpponentDeckVersionId !== null,
        latestOpponentDeckVersionId: v.latestOpponentDeckVersionId,
      }))
      .sort((a, b) => b.totalMatches - a.totalMatches);
  }

  async getOpponentDecklist(userId: string, opponentDeckVersionId: string) {
    // Verify this deck is linked to at least one match of this user
    const match = await this.prisma.match.findFirst({
      where: { userId, opponentDeckVersionId },
    });
    if (!match) throw new NotFoundException('Opponent deck not found');

    const opponentDeck = await this.prisma.opponentDeckVersion.findUnique({
      where: { id: opponentDeckVersionId },
      include: { cards: true },
    });
    if (!opponentDeck) throw new NotFoundException('Opponent deck not found');

    const cardData = await this.cardsService.getCards(opponentDeck.cards.map((c) => c.cardId));

    const resolveSlot = (dc: { cardId: string; slot: string }): string => {
      if (dc.slot !== 'main') return dc.slot;
      if (opponentDeck.leaderId && dc.cardId === opponentDeck.leaderId) return 'leader';
      if (opponentDeck.baseId && dc.cardId === opponentDeck.baseId) return 'base';
      return dc.slot;
    };

    return {
      id: opponentDeck.id,
      sourceUrl: opponentDeck.sourceUrl,
      cards: opponentDeck.cards.map((dc, i) => ({
        cardId: dc.cardId,
        quantity: dc.quantity,
        slot: resolveSlot(dc),
        card: cardData[i],
      })),
    };
  }
}
