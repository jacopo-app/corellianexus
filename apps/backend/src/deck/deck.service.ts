import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from '../cards/cards.service';
import { ImportDeckDto } from './deck.dto';
import { SwudbProvider } from './providers/swudb.provider';
import { DeckProvider } from './providers/deck-provider.interface';
import { computeDeckHash } from './deck-hash.util';

@Injectable()
export class DeckService {
  private providers: DeckProvider[] = [new SwudbProvider()];

  constructor(
    private prisma: PrismaService,
    private cardsService: CardsService,
  ) {}

  async importDeck(userId: string, dto: ImportDeckDto) {
    const provider = this.providers.find((p) => p.canHandle(dto.url));
    if (!provider) {
      throw new BadRequestException('Unsupported deck URL provider');
    }

    const rawData = await provider.fetch(dto.url);
    const parsed = provider.parse(rawData);
    const deckHash = computeDeckHash(parsed.cards);

    // Determine deck name: explicit > from provider metadata > fallback
    const deckName = dto.name ?? parsed.name ?? `Deck from ${new URL(dto.url).hostname}`;

    // Create the deck container
    const deck = await this.prisma.deck.create({
      data: { userId, name: deckName },
    });

    // Check if this exact version already exists for this deck
    const existingVersion = await this.prisma.deckVersion.findUnique({
      where: { deckId_deckHash: { deckId: deck.id, deckHash } },
    });

    if (existingVersion) {
      return { deck, version: existingVersion, duplicate: true };
    }

    // Count existing versions to assign version number
    const versionCount = await this.prisma.deckVersion.count({
      where: { deckId: deck.id },
    });

    const version = await this.prisma.deckVersion.create({
      data: {
        deckId: deck.id,
        versionNumber: versionCount + 1,
        deckHash,
        sourceUrl: dto.url,
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
      include: { cards: true },
    });

    return { deck, version, duplicate: false };
  }

  async getUserDecks(userId: string) {
    return this.prisma.deck.findMany({
      where: { userId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: { id: true, versionNumber: true, sourceUrl: true },
        },
        _count: { select: { versions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeck(userId: string, deckId: string) {
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, userId },
      include: { versions: { orderBy: { versionNumber: 'asc' } } },
    });
    if (!deck) throw new NotFoundException('Deck not found');
    return deck;
  }

  async deleteDeck(userId: string, deckId: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, userId } });
    if (!deck) throw new NotFoundException('Deck not found');

    const versions = await this.prisma.deckVersion.findMany({ where: { deckId } });
    const versionIds = versions.map((v) => v.id);

    // Delete in dependency order
    await this.prisma.match.deleteMany({ where: { deckVersionId: { in: versionIds } } });
    await this.prisma.deckCard.deleteMany({ where: { deckVersionId: { in: versionIds } } });
    await this.prisma.deckVersion.deleteMany({ where: { deckId } });
    await this.prisma.deck.delete({ where: { id: deckId } });

    return { deleted: true };
  }

  async getDeckVersions(userId: string, deckId: string) {
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, userId },
    });
    if (!deck) throw new NotFoundException('Deck not found');

    return this.prisma.deckVersion.findMany({
      where: { deckId },
      include: { cards: true },
      orderBy: { versionNumber: 'asc' },
    });
  }

  async getDecklistWithCards(userId: string, deckId: string, versionId?: string) {
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, userId },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!deck) throw new NotFoundException('Deck not found');

    const version = versionId
      ? deck.versions.find((v) => v.id === versionId)
      : deck.versions[0];
    if (!version) throw new NotFoundException('Version not found');

    const deckCards = await this.prisma.deckCard.findMany({
      where: { deckVersionId: version.id },
    });

    const cardData = await this.cardsService.getCards(deckCards.map((c) => c.cardId));

    const resolveSlot = (dc: { cardId: string; slot: string }): string => {
      // Prefer explicit non-'main' slot (new decks)
      if (dc.slot !== 'main') return dc.slot;
      // For old decks: use leaderId/baseId stored on the version
      if (version.leaderId && dc.cardId === version.leaderId) return 'leader';
      if (version.baseId && dc.cardId === version.baseId) return 'base';
      return dc.slot;
    };

    const cards = deckCards.map((dc, i) => ({
      cardId: dc.cardId,
      quantity: dc.quantity,
      slot: resolveSlot(dc),
      card: cardData[i],
    }));

    return {
      deck: { id: deck.id, name: deck.name },
      version: { id: version.id, versionNumber: version.versionNumber },
      allVersions: deck.versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber })),
      cards,
    };
  }

  async getDeckVersionDiff(userId: string, deckId: string, versionAId: string, versionBId: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, userId } });
    if (!deck) throw new NotFoundException('Deck not found');

    const [cardsA, cardsB] = await Promise.all([
      this.prisma.deckCard.findMany({ where: { deckVersionId: versionAId } }),
      this.prisma.deckCard.findMany({ where: { deckVersionId: versionBId } }),
    ]);

    const mapA = new Map(cardsA.map((c) => [c.cardId, c.quantity]));
    const mapB = new Map(cardsB.map((c) => [c.cardId, c.quantity]));

    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
    const changed: { cardId: string; qtyA: number; qtyB: number; delta: number }[] = [];

    for (const id of allIds) {
      const qtyA = mapA.get(id) ?? 0;
      const qtyB = mapB.get(id) ?? 0;
      if (qtyA !== qtyB) changed.push({ cardId: id, qtyA, qtyB, delta: qtyB - qtyA });
    }

    const cardData = await this.cardsService.getCards(changed.map((c) => c.cardId));

    return changed.map((c, i) => ({ ...c, card: cardData[i] }));
  }
}
