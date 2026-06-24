import { Module } from '@nestjs/common';
import { FixedCostsModule } from '../fixed-costs/fixed-costs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkersModule } from '../workers/workers.module';
import { TreasuryController } from './treasury.controller';
import { TreasuryService } from './treasury.service';

@Module({
  imports: [PrismaModule, FixedCostsModule, WorkersModule],
  controllers: [TreasuryController],
  providers: [TreasuryService],
})
export class TreasuryModule {}
