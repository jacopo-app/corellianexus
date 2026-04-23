import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DeckModule } from './deck/deck.module';
import { MatchModule } from './match/match.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CardsModule } from './cards/cards.module';
import { MetaModule } from './meta/meta.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DeckModule,
    MatchModule,
    AnalyticsModule,
    CardsModule,
    MetaModule,
  ],
})
export class AppModule {}
