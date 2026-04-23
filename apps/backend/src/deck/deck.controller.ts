import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeckService } from './deck.service';
import { ImportDeckDto } from './deck.dto';

@UseGuards(JwtAuthGuard)
@Controller('decks')
export class DeckController {
  constructor(private deckService: DeckService) {}

  @Post('import')
  import(@Request() req, @Body() dto: ImportDeckDto) {
    return this.deckService.importDeck(req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req) {
    return this.deckService.getUserDecks(req.user.userId);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.deckService.getDeck(req.user.userId, id);
  }

  @Get(':id/versions')
  getVersions(@Request() req, @Param('id') id: string) {
    return this.deckService.getDeckVersions(req.user.userId, id);
  }

  @Get(':id/decklist')
  getDecklist(
    @Request() req,
    @Param('id') id: string,
    @Query('versionId') versionId?: string,
  ) {
    return this.deckService.getDecklistWithCards(req.user.userId, id, versionId);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.deckService.deleteDeck(req.user.userId, id);
  }

  @Get(':id/diff')
  getDiff(
    @Request() req,
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.deckService.getDeckVersionDiff(req.user.userId, id, from, to);
  }
}
