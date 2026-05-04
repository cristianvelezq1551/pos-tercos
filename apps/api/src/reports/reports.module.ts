import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReconciliationService],
  exports: [ReportsService, ReconciliationService],
})
export class ReportsModule {}
