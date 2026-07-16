import { Module } from '@nestjs/common';
import { FixedCostsModule } from '../fixed-costs/fixed-costs.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RecipesModule } from '../recipes/recipes.module';
import { WorkersModule } from '../workers/workers.module';
import { CogsService } from './cogs.service';
import { FinanceSummaryService } from './finance-summary.service';
import { FinancialReportsService } from './financial-reports.service';
import { InventoryUsageService } from './inventory-usage.service';
import { OwnerDigestService } from './owner-digest.service';
import { ReconciliationService } from './reconciliation.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SalesReportsService } from './sales-reports.service';

@Module({
  imports: [RecipesModule, FixedCostsModule, WorkersModule, InventoryModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReconciliationService,
    SalesReportsService,
    CogsService,
    FinancialReportsService,
    FinanceSummaryService,
    InventoryUsageService,
    OwnerDigestService,
  ],
  exports: [
    ReportsService,
    ReconciliationService,
    SalesReportsService,
    CogsService,
    FinancialReportsService,
    FinanceSummaryService,
  ],
})
export class ReportsModule {}
