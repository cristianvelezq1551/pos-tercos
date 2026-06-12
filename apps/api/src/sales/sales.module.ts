import { forwardRef, Module } from '@nestjs/common';
import { KdsModule } from '../kds/kds.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { RecipesModule } from '../recipes/recipes.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { ReceiptIntegrityService } from './receipt-integrity.service';
import { SalesConsumptionService } from './sales-consumption.service';
import { SalesController } from './sales.controller';
import { SalesOfflineService } from './sales-offline.service';
import { SalesEditService } from './sales-edit.service';
import { SalesReceiptService } from './sales-receipt.service';
import { SalesService } from './sales.service';

@Module({
  imports: [
    RecipesModule,
    PromotionsModule,
    ShiftsModule,
    forwardRef(() => KdsModule),
  ],
  controllers: [SalesController],
  providers: [
    SalesService,
    SalesConsumptionService,
    SalesOfflineService,
    SalesReceiptService,
    SalesEditService,
    ReceiptIntegrityService,
  ],
  exports: [SalesService, ReceiptIntegrityService],
})
export class SalesModule {}
