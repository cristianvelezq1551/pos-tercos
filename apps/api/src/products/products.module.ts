import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { ProductCategoriesModule } from '../product-categories/product-categories.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [RecipesModule, ProductCategoriesModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
