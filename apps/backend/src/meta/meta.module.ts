import { Module } from '@nestjs/common';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';
import { MetaStatsSyncService } from './meta-stats-sync.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CardsModule } from '../cards/cards.module';

@Module({
  imports: [PrismaModule, CardsModule],
  controllers: [MetaController],
  providers: [MetaService, MetaStatsSyncService],
})
export class MetaModule {}
