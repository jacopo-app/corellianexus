import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchService } from './match.service';
import { CreateMatchDto } from './match.dto';

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchController {
  constructor(private matchService: MatchService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateMatchDto) {
    return this.matchService.createMatch(req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req) {
    return this.matchService.getUserMatches(req.user.userId);
  }
}
