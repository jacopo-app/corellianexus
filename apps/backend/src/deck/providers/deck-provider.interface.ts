import { ParsedDeckDto } from '../deck.dto';

export interface DeckProvider {
  canHandle(url: string): boolean;
  fetch(url: string): Promise<unknown>;
  parse(rawData: unknown): ParsedDeckDto;
}
