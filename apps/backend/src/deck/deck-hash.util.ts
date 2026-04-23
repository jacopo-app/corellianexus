import { createHash } from 'crypto';
import { DeckCardDto } from './deck.dto';

export function computeDeckHash(cards: DeckCardDto[]): string {
  const sorted = [...cards].sort((a, b) => a.card_id.localeCompare(b.card_id));
  const str = sorted.map((c) => `${c.card_id}:${c.qty}`).join(',');
  return createHash('sha256').update(str).digest('hex');
}
