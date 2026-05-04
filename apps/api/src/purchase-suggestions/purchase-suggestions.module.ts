import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseSuggestionsController } from './purchase-suggestions.controller';
import { PurchaseSuggestionsService } from './purchase-suggestions.service';

@Module({
  imports: [InventoryModule],
  controllers: [PurchaseSuggestionsController],
  providers: [PurchaseSuggestionsService],
  exports: [PurchaseSuggestionsService],
})
export class PurchaseSuggestionsModule {}
