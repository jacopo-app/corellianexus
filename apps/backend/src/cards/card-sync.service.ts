import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SETS = ['SOR', 'SHD', 'TWI', 'JTL', 'LAW', 'LOF', 'SEC'];
const PAGE_SIZE = 250;
const BASE_URL = 'https://api.swu-db.com/cards/search';

interface RawCard {
  Set: string;
  Number: string | number;
  Name: string;
  Subtitle?: string;
  Type: string;
  Aspects?: string[];
  Traits?: string[];
  Arenas?: string[];
  Cost?: string | number;
  Power?: string | number;
  HP?: string | number;
  FrontText?: string;
  BackText?: string;
  EpicAction?: string;
  Rarity: string;
  Unique?: boolean;
  DoubleSided?: boolean;
  FrontArt: string;
  BackArt?: string;
  VariantType?: string;
}

interface SearchResult {
  data: RawCard[];
  count: number;
  totalCount: number;
}

@Injectable()
export class CardSyncService {
  private readonly logger = new Logger(CardSyncService.name);

  constructor(private prisma: PrismaService) {}

  async syncAll(): Promise<{ upserted: number; sets: string[] }> {
    let total = 0;

    for (const set of SETS) {
      const count = await this.syncSet(set);
      this.logger.log(`${set}: ${count} cards upserted`);
      total += count;
    }

    return { upserted: total, sets: SETS };
  }

  private async syncSet(set: string): Promise<number> {
    // swu-db.com returns all cards in a single response regardless of pageSize/page params
    const url = `${BASE_URL}?q=set%3A${set.toLowerCase()}&pageSize=${PAGE_SIZE}`;

    let result: SearchResult;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'CorelliaNexus/1.0' } });
      if (!res.ok) {
        this.logger.warn(`${set}: HTTP ${res.status}`);
        return 0;
      }
      result = (await res.json()) as SearchResult;
    } catch (e) {
      this.logger.error(`${set}: fetch error`, e);
      return 0;
    }

    if (!result.data?.length) return 0;

    // Use createMany with skipDuplicates for bulk insert, then update existing
    const cards = result.data.map((raw) => {
      const number = String(raw.Number).padStart(3, '0');
      const variant = raw.VariantType ?? 'Normal';
      const id = variant === 'Normal'
        ? `${set}_${number}`
        : `${set}_${number}_${variant.toLowerCase().replace(/\s+/g, '_')}`;
      return {
        id, set, number, variant,
        name: raw.Name,
        subtitle: raw.Subtitle ?? null,
        type: raw.Type,
        aspects: raw.Aspects ?? [],
        traits: raw.Traits ?? [],
        arenas: raw.Arenas ?? [],
        cost: raw.Cost != null ? String(raw.Cost) : null,
        power: raw.Power != null ? String(raw.Power) : null,
        hp: raw.HP != null ? String(raw.HP) : null,
        frontText: raw.FrontText ?? null,
        backText: raw.BackText ?? null,
        epicAction: raw.EpicAction ?? null,
        rarity: raw.Rarity,
        unique: raw.Unique ?? false,
        doubleSided: raw.DoubleSided ?? false,
        frontArt: raw.FrontArt,
        backArt: raw.BackArt ?? null,
      };
    });

    // Bulk upsert via individual upserts in parallel batches of 50
    const BATCH = 50;
    for (let i = 0; i < cards.length; i += BATCH) {
      const batch = cards.slice(i, i + BATCH);
      await Promise.all(
        batch.map((c) =>
          this.prisma.card.upsert({
            where: { id: c.id },
            update: { name: c.name, subtitle: c.subtitle, type: c.type, aspects: c.aspects, traits: c.traits, arenas: c.arenas, cost: c.cost, power: c.power, hp: c.hp, frontText: c.frontText, backText: c.backText, epicAction: c.epicAction, rarity: c.rarity, unique: c.unique, doubleSided: c.doubleSided, frontArt: c.frontArt, backArt: c.backArt },
            create: c,
          }),
        ),
      );
    }

    return cards.length;
  }
}
