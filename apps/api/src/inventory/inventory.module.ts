import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockCountsService } from './stock-counts.service';

@Module({
  // Recetas: para estimar el costo de un subproducto que entra sin precio
  // (su "último precio" es el costo de su receta; no tiene precio de compra).
  imports: [RecipesModule],
  controllers: [InventoryController],
  providers: [InventoryService, StockCountsService],
  exports: [InventoryService, StockCountsService],
})
export class InventoryModule {}
