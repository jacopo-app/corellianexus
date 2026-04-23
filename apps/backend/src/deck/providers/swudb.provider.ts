import { BadRequestException } from '@nestjs/common';
import { DeckProvider } from './deck-provider.interface';
import { ParsedDeckDto } from '../deck.dto';

interface SwudbCard {
  id: string;
  count: number;
}

interface SwudbResponse {
  metadata: { name: string; author: string };
  leader: SwudbCard | null;
  secondleader: SwudbCard | null;
  base: SwudbCard | null;
  deck: SwudbCard[];
  sideboard: SwudbCard[];
}

export class SwudbProvider implements DeckProvider {
  canHandle(url: string): boolean {
    return url.includes('swudb.com/deck/');
  }

  async fetch(url: string): Promise<SwudbResponse> {
    const deckId = this.extractDeckId(url);
    const apiUrl = `https://swudb.com/api/getDeckJson/${deckId}`;

    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'CorelliaNexus/1.0' },
    });

    if (!response.ok) {
      throw new BadRequestException(`Failed to fetch deck: ${response.status}`);
    }

    return response.json() as Promise<SwudbResponse>;
  }

  parse(rawData: unknown): ParsedDeckDto {
    const data = rawData as SwudbResponse;

    if (!data.deck || !Array.isArray(data.deck)) {
      throw new BadRequestException('Invalid deck data from SWUDB');
    }

    const cards: { card_id: string; qty: number; slot: 'leader' | 'secondleader' | 'base' | 'main' | 'sideboard' }[] = data.deck.map((card) => ({
      card_id: card.id,
      qty: card.count,
      slot: 'main' as const,
    }));

    // Include leader and base with explicit slots
    if (data.base) cards.unshift({ card_id: data.base.id, qty: 1, slot: 'base' as const });
    if (data.secondleader) cards.unshift({ card_id: data.secondleader.id, qty: 1, slot: 'secondleader' as const });
    if (data.leader) cards.unshift({ card_id: data.leader.id, qty: 1, slot: 'leader' as const });

    // Sideboard
    const sideboard = (data.sideboard ?? []).map((card) => ({
      card_id: card.id,
      qty: card.count,
      slot: 'sideboard' as const,
    }));

    return {
      name: data.metadata?.name?.trim() || undefined,
      leader: data.leader?.id,
      base: data.base?.id,
      cards: [...cards, ...sideboard],
    };
  }

  private extractDeckId(url: string): string {
    const match = url.match(/swudb\.com\/deck\/([a-zA-Z0-9]+)/);
    if (!match) throw new BadRequestException('Invalid SWUDB URL');
    return match[1];
  }
}
