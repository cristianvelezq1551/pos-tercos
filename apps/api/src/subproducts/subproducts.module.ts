import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { RecipesModule } from '../recipes/recipes.module';
import { ProductionService } from './production.service';
import { SubproductsController } from './subproducts.controller';
import { SubproductsService } from './subproducts.service';

@Module({
  imports: [RecipesModule, InventoryModule],
  controllers: [SubproductsController],
  providers: [SubproductsService, ProductionService],
  exports: [SubproductsService, ProductionService],
})
export class SubproductsModule {}
