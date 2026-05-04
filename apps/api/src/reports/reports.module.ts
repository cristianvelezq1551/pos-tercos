import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { ReconciliationService } from './reconciliation.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SalesReportsService } from './sales-reports.service';

@Module({
  imports: [RecipesModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReconciliationService, SalesReportsService],
  exports: [ReportsService, ReconciliationService, SalesReportsService],
})
export class ReportsModule {}
