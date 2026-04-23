import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import { CreateMatchDto } from './match.dto';
import { SwudbProvider } from '../deck/providers/swudb.provider';

@Injectable()
export class MatchService {
  private deckProvider = new SwudbProvider();

  constructor(
    private prisma: PrismaService,
    private cardsService: CardsService,
  ) {}

  async createMatch(userId: string, dto: CreateMatchDto) {
    const deckVersion = await this.prisma.deckVersion.findFirst({
      where: { id: dto.deckVersionId, deck: { userId } },
    });
    if (!deckVersion) {
      throw new BadRequestException('Deck version not found or not yours');
    }

    const normalizedName = dto.opponentArchetype.trim().toLowerCase();
    const archetype = await this.prisma.opponentArchetype.upsert({
      where: { normalizedName },
      update: {},
      create: { name: dto.opponentArchetype.trim(), normalizedName },
    });

    let opponentDeckVersionId: string | null = null;
    if (dto.opponentDeckUrl) {
      try {
        if (!this.deckProvider.canHandle(dto.opponentDeckUrl)) {
          throw new BadRequestException('Unsupported opponent deck URL');
        }
        const raw = await this.deckProvider.fetch(dto.opponentDeckUrl);
        const parsed = this.deckProvider.parse(raw);
        const opponentDeck = await this.prisma.opponentDeckVersion.create({
          data: {
            sourceUrl: dto.opponentDeckUrl,
            leaderId: parsed.leader ?? null,
            baseId: parsed.base ?? null,
            cards: {
              create: parsed.cards.map((c) => ({
                cardId: c.card_id,
                quantity: c.qty,
                slot: c.slot ?? 'main',
              })),
            },
          },
        });
        opponentDeckVersionId = opponentDeck.id;
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
      }
    }

    return this.prisma.match.create({
      data: {
        userId,
        deckVersionId: dto.deckVersionId,
        opponentArchetypeId: archetype.id,
        opponentDeckVersionId,
        result: dto.result,
        initiative: dto.initiative ?? null,
        games: dto.games ?? [],
      },
      include: {
        deckVersion: { include: { deck: true } },
        opponentArchetype: true,
        opponentDeckVersion: { include: { cards: true } },
      },
    });
  }

  async getUserMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { userId },
      include: {
        deckVersion: { include: { deck: true } },
        opponentArchetype: true,
        opponentDeckVersion: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Collect unique card IDs to resolve (leader/base of my deck + opponent deck)
    const cardIds = new Set<string>();
    for (const m of matches) {
      if (m.deckVersion.leaderId) cardIds.add(m.deckVersion.leaderId);
      if (m.deckVersion.baseId) cardIds.add(m.deckVersion.baseId);
      if (m.opponentDeckVersion?.leaderId) cardIds.add(m.opponentDeckVersion.leaderId);
      if (m.opponentDeckVersion?.baseId) cardIds.add(m.opponentDeckVersion.baseId);
    }

    // Fetch all needed cards at once (cached)
    const cardMap = new Map<string, { name: string; frontArt: string; aspects: string[] }>();
    if (cardIds.size > 0) {
      const cards = await this.cardsService.getCards([...cardIds]);
      [...cardIds].forEach((id, i) => {
        cardMap.set(id, {
          name: cards[i].name,
          frontArt: cards[i].frontArt,
          aspects: cards[i].aspects,
        });
      });
    }

    return matches.map((m) => ({
      id: m.id,
      result: m.result,
      initiative: m.initiative,
      games: m.games,
      createdAt: m.createdAt,
      deckVersion: {
        id: m.deckVersion.id,
        versionNumber: m.deckVersion.versionNumber,
        deck: { id: m.deckVersion.deck.id, name: m.deckVersion.deck.name },
        leaderCard: m.deckVersion.leaderId ? cardMap.get(m.deckVersion.leaderId) ?? null : null,
        baseCard: m.deckVersion.baseId ? cardMap.get(m.deckVersion.baseId) ?? null : null,
      },
      opponentArchetype: {
        id: m.opponentArchetype.id,
        name: m.opponentArchetype.name,
      },
      opponentDeckVersion: m.opponentDeckVersion
        ? {
            id: m.opponentDeckVersion.id,
            leaderCard: m.opponentDeckVersion.leaderId
              ? cardMap.get(m.opponentDeckVersion.leaderId) ?? null
              : null,
            baseCard: m.opponentDeckVersion.baseId
              ? cardMap.get(m.opponentDeckVersion.baseId) ?? null
              : null,
          }
        : null,
    }));
  }
}
