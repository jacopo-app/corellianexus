import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CardsService } from './cards.service';
import { CardSyncService } from './card-sync.service';

@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(
    private cardsService: CardsService,
    private cardSyncService: CardSyncService,
  ) {}

  @Post('sync')
  sync() {
    return this.cardSyncService.syncAll();
  }

  @Get('stats')
  getStats() {
    return this.cardsService.getCatalogStats();
  }

  @Get('search')
  search(
    @Query('name') name?: string,
    @Query('type') type?: string,
    @Query('set') set?: string,
    @Query('aspect') aspect?: string,
  ) {
    return this.cardsService.searchCards({ name, type, set, aspect });
  }

  @Get(':cardId')
  getCard(@Param('cardId') cardId: string) {
    return this.cardsService.getCard(cardId);
  }
}
