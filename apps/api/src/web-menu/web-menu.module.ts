import { Module } from '@nestjs/common';
import { ProductCategoriesModule } from '../product-categories/product-categories.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { WebMenuController } from './web-menu.controller';
import { WebMenuService } from './web-menu.service';

@Module({
  imports: [ProductCategoriesModule, PromotionsModule],
  controllers: [WebMenuController],
  providers: [WebMenuService],
})
export class WebMenuModule {}
