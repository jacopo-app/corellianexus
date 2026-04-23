import { IsString, IsEnum, IsOptional, IsUUID, IsUrl, IsArray } from 'class-validator';

export enum MatchResult {
  win = 'win',
  loss = 'loss',
}

export enum Initiative {
  first = 'first',
  second = 'second',
}

export class CreateMatchDto {
  @IsUUID()
  deckVersionId: string;

  @IsString()
  opponentArchetype: string;

  @IsEnum(MatchResult)
  result: MatchResult;

  @IsEnum(Initiative)
  @IsOptional()
  initiative?: Initiative;

  @IsArray()
  @IsOptional()
  games?: string[];

  @IsUrl()
  @IsOptional()
  opponentDeckUrl?: string;
}
