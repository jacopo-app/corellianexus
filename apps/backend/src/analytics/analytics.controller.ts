import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('overview')
  overview(@Request() req) {
    return this.analyticsService.getOverview(req.user.userId);
  }

  @Get('deck/:id')
  deckStats(@Request() req, @Param('id') id: string) {
    return this.analyticsService.getDeckAnalytics(req.user.userId, id);
  }

  @Get('matchups')
  matchups(@Request() req) {
    return this.analyticsService.getMatchups(req.user.userId);
  }

  @Get('opponent-deck/:id')
  opponentDecklist(@Request() req, @Param('id') id: string) {
    return this.analyticsService.getOpponentDecklist(req.user.userId, id);
  }
}
