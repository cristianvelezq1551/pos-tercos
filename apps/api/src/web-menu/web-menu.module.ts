import { Module } from '@nestjs/common';
import { WebMenuController } from './web-menu.controller';
import { WebMenuService } from './web-menu.service';

@Module({
  controllers: [WebMenuController],
  providers: [WebMenuService],
})
export class WebMenuModule {}
