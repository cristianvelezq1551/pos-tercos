import { Module } from '@nestjs/common';
import { PromotionsModule } from '../promotions/promotions.module';
import { RecipesModule } from '../recipes/recipes.module';
import { ReceiptIntegrityService } from './receipt-integrity.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [RecipesModule, PromotionsModule],
  controllers: [SalesController],
  providers: [SalesService, ReceiptIntegrityService],
  exports: [SalesService, ReceiptIntegrityService],
})
export class SalesModule {}
