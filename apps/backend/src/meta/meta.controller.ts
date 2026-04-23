import { Controller, Get, Param, Post, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MetaService } from './meta.service';
import { MetaStatsSyncService } from './meta-stats-sync.service';

@Controller('meta')
@UseGuards(JwtAuthGuard)
export class MetaController {
  constructor(
    private readonly metaService: MetaService,
    private readonly statsSync: MetaStatsSyncService,
  ) {}

  @Post('sync')
  async sync() {
    return this.metaService.sync();
  }

  @Post('sync/stats')
  async syncStats() {
    return this.statsSync.syncAll();
  }

  @Get('matchup')
  async getMatchup(@Query('leaderID') leaderID: string, @Query('baseID') baseID: string) {
    return this.metaService.getMatchupMatrix(leaderID, baseID);
  }

  @Get('stats')
  async getStats() {
    return this.metaService.getMetaStats();
  }

  @Get('decks/:id')
  async getDeck(@Param('id') id: string) {
    const deck = await this.metaService.getMetaDeck(id);
    if (!deck) throw new NotFoundException('Meta deck not found');
    return deck;
  }

  // ── SWUStats ──────────────────────────────────────────────────────────────

  @Get('winrates/leaders')
  async getLeaderWinrates() {
    return this.metaService.getLeaderWinrates();
  }

  @Get('winrates/cards')
  async getCardWinrates() {
    return this.metaService.getCardWinrates();
  }

  // ── Limitless TCG ─────────────────────────────────────────────────────────

  @Get('tournaments')
  async getTournaments(@Query('limit') limit?: string) {
    return this.metaService.getTournaments(limit ? parseInt(limit) : 20);
  }

  @Get('tournaments/:id/standings')
  async getTournamentStandings(@Param('id') id: string) {
    return this.metaService.getTournamentStandings(id);
  }

  // ── SWUStats Melee Tournaments ────────────────────────────────────────────

  @Get('swustats/tournaments')
  async getSwuStatsTournaments(@Query('limit') limit?: string) {
    return this.metaService.getSwuStatsTournaments(limit ? parseInt(limit) : 50);
  }

  @Get('swustats/tournaments/:id')
  async getSwuStatsTournamentDetail(@Param('id') id: string) {
    const detail = await this.metaService.getSwuStatsTournamentDetail(parseInt(id));
    if (!detail) throw new NotFoundException('Tournament not found');
    return detail;
  }
}
