import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockCountsService } from './stock-counts.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, StockCountsService],
  exports: [InventoryService],
})
export class InventoryModule {}
