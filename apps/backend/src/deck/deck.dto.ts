import { IsString, IsUrl, IsOptional } from 'class-validator';

export class ImportDeckDto {
  @IsUrl()
  url: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export interface DeckCardDto {
  card_id: string;
  qty: number;
  slot?: 'leader' | 'secondleader' | 'base' | 'main' | 'sideboard';
}

export interface ParsedDeckDto {
  name?: string;
  leader?: string;
  base?: string;
  cards: DeckCardDto[];
}
