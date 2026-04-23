import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CardData {
  id: string;
  set: string;
  number: string;
  variant: string;
  name: string;
  subtitle?: string;
  type: string;
  aspects: string[];
  traits: string[];
  arenas: string[];
  cost?: string;
  power?: string;
  hp?: string;
  frontText?: string;
  backText?: string;
  epicAction?: string;
  rarity: string;
  unique: boolean;
  doubleSided: boolean;
  frontArt: string;
  backArt?: string;
}

@Injectable()
export class CardsService {
  // In-memory cache per chiamate ripetute nella stessa sessione
  private cache = new Map<string, CardData>();

  constructor(private prisma: PrismaService) {}

  async getCard(cardId: string): Promise<CardData> {
    if (this.cache.has(cardId)) return this.cache.get(cardId)!;

    // 1. Cerca nel DB
    const dbCard = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (dbCard) {
      const card = this.mapDb(dbCard);
      this.cache.set(cardId, card);
      return card;
    }

    // 2. Fallback: API swu-db.com
    const card = await this.fetchFromApi(cardId);
    this.cache.set(cardId, card);
    return card;
  }

  async getCards(cardIds: string[]): Promise<CardData[]> {
    return Promise.all(cardIds.map((id) => this.getCard(id)));
  }

  async searchByName(name: string, subtitle?: string, type?: string): Promise<CardData | null> {
    const cacheKey = `name:${name}:${subtitle ?? ''}:${type ?? ''}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    // 1. Cerca nel DB
    const dbCard = await this.prisma.card.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(subtitle ? { subtitle: { equals: subtitle, mode: 'insensitive' } } : {}),
        ...(type ? { type: { equals: type, mode: 'insensitive' } } : {}),
      },
      orderBy: { variant: 'asc' }, // prefer Normal over showcase variants
    });

    if (dbCard) {
      const card = this.mapDb(dbCard);
      this.cache.set(cacheKey, card);
      return card;
    }

    // 2. Fallback API
    try {
      const q = [
        `name%3A%22${encodeURIComponent(name)}%22`,
        subtitle ? `subtitle%3A%22${encodeURIComponent(subtitle)}%22` : '',
        type ? `type%3A%22${encodeURIComponent(type)}%22` : '',
      ].filter(Boolean).join('+');
      const res = await fetch(`https://api.swu-db.com/cards/search?q=${q}`, {
        headers: { 'User-Agent': 'CorelliaNexus/1.0' },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { data: Record<string, unknown>[] };
      const raw = data.data?.[0];
      if (!raw) return null;

      const set = raw['Set'] as string;
      const number = String(raw['Number']).padStart(3, '0');
      const card: CardData = {
        id: `${set}_${number}`,
        set,
        number,
        variant: 'standard',
        name: raw['Name'] as string,
        subtitle: raw['Subtitle'] as string | undefined,
        type: raw['Type'] as string,
        aspects: (raw['Aspects'] as string[]) ?? [],
        traits: (raw['Traits'] as string[]) ?? [],
        arenas: (raw['Arenas'] as string[]) ?? [],
        cost: raw['Cost'] as string | undefined,
        power: raw['Power'] as string | undefined,
        hp: raw['HP'] as string | undefined,
        frontText: raw['FrontText'] as string | undefined,
        backText: raw['BackText'] as string | undefined,
        epicAction: raw['EpicAction'] as string | undefined,
        rarity: raw['Rarity'] as string,
        unique: raw['Unique'] as boolean,
        doubleSided: raw['DoubleSided'] as boolean,
        frontArt: raw['FrontArt'] as string,
        backArt: raw['BackArt'] as string | undefined,
      };
      this.cache.set(cacheKey, card);
      return card;
    } catch {
      return null;
    }
  }

  async searchCards(query: { name?: string; type?: string; set?: string; aspect?: string }): Promise<CardData[]> {
    const cards = await this.prisma.card.findMany({
      where: {
        variant: 'Normal',
        ...(query.name ? { name: { contains: query.name, mode: 'insensitive' } } : {}),
        ...(query.type ? { type: { equals: query.type, mode: 'insensitive' } } : {}),
        ...(query.set ? { set: { equals: query.set.toUpperCase() } } : {}),
        ...(query.aspect ? { aspects: { has: query.aspect } } : {}),
      },
      orderBy: [{ set: 'asc' }, { number: 'asc' }],
      take: 100,
    });
    return cards.map(this.mapDb);
  }

  async getCatalogStats(): Promise<{ total: number; bySet: Record<string, number> }> {
    const total = await this.prisma.card.count();
    const bySetRaw = await this.prisma.card.groupBy({
      by: ['set'],
      _count: { id: true },
      orderBy: { set: 'asc' },
    });
    const bySet = Object.fromEntries(bySetRaw.map((r) => [r.set, r._count.id]));
    return { total, bySet };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private mapDb(dbCard: {
    id: string; set: string; number: string; variant: string;
    name: string; subtitle: string | null; type: string;
    aspects: string[]; traits: string[]; arenas: string[];
    cost: string | null; power: string | null; hp: string | null;
    frontText: string | null; backText: string | null; epicAction: string | null;
    rarity: string; unique: boolean; doubleSided: boolean;
    frontArt: string; backArt: string | null;
  }): CardData {
    return {
      id: dbCard.id,
      set: dbCard.set,
      number: dbCard.number,
      variant: dbCard.variant,
      name: dbCard.name,
      subtitle: dbCard.subtitle ?? undefined,
      type: dbCard.type,
      aspects: dbCard.aspects,
      traits: dbCard.traits,
      arenas: dbCard.arenas,
      cost: dbCard.cost ?? undefined,
      power: dbCard.power ?? undefined,
      hp: dbCard.hp ?? undefined,
      frontText: dbCard.frontText ?? undefined,
      backText: dbCard.backText ?? undefined,
      epicAction: dbCard.epicAction ?? undefined,
      rarity: dbCard.rarity,
      unique: dbCard.unique,
      doubleSided: dbCard.doubleSided,
      frontArt: dbCard.frontArt,
      backArt: dbCard.backArt ?? undefined,
    };
  }

  private async fetchFromApi(cardId: string): Promise<CardData> {
    const [set, number] = cardId.split('_');
    if (!set || !number) throw new NotFoundException(`Invalid card ID: ${cardId}`);

    let raw: Record<string, unknown> | null = null;

    try {
      const res = await fetch(`https://api.swu-db.com/cards/${set}/${number}`, {
        headers: { 'User-Agent': 'CorelliaNexus/1.0' },
      });
      if (res.ok) raw = (await res.json()) as Record<string, unknown>;
    } catch { /* fallthrough */ }

    if (!raw) {
      try {
        const searchRes = await fetch(
          `https://api.swu-db.com/cards/search?q=set%3A${set.toLowerCase()}+number%3A${number}`,
          { headers: { 'User-Agent': 'CorelliaNexus/1.0' } },
        );
        if (searchRes.ok) {
          const data = (await searchRes.json()) as { data: Record<string, unknown>[] };
          const match = data.data?.find(
            (c) => String(c['Number']).padStart(3, '0') === number.padStart(3, '0'),
          );
          if (match) raw = match;
        }
      } catch { /* fallthrough */ }
    }

    if (!raw) {
      raw = {
        Set: set, Number: number, Name: `${set} ${number}`,
        Type: 'Unknown', Aspects: [], Traits: [], Arenas: [],
        Rarity: 'Common', Unique: false, DoubleSided: false,
        FrontArt: `https://cdn.swu-db.com/images/cards/${set}/${number}.png`,
      };
    }

    return {
      id: cardId,
      set: raw['Set'] as string,
      number: raw['Number'] as string,
      variant: 'standard',
      name: raw['Name'] as string,
      subtitle: raw['Subtitle'] as string | undefined,
      type: raw['Type'] as string,
      aspects: (raw['Aspects'] as string[]) ?? [],
      traits: (raw['Traits'] as string[]) ?? [],
      arenas: (raw['Arenas'] as string[]) ?? [],
      cost: raw['Cost'] as string | undefined,
      power: raw['Power'] as string | undefined,
      hp: raw['HP'] as string | undefined,
      frontText: raw['FrontText'] as string | undefined,
      backText: raw['BackText'] as string | undefined,
      epicAction: raw['EpicAction'] as string | undefined,
      rarity: raw['Rarity'] as string,
      unique: raw['Unique'] as boolean,
      doubleSided: raw['DoubleSided'] as boolean,
      frontArt: raw['FrontArt'] as string,
      backArt: raw['BackArt'] as string | undefined,
    };
  }
}
