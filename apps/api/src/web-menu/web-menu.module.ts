import { Module } from '@nestjs/common';
import { PromotionsModule } from '../promotions/promotions.module';
import { WebMenuController } from './web-menu.controller';
import { WebMenuService } from './web-menu.service';

@Module({
  imports: [PromotionsModule],
  controllers: [WebMenuController],
  providers: [WebMenuService],
})
export class WebMenuModule {}
