import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { WebOrderTokenService } from './web-order-token.service';
import { WebOrdersController } from './web-orders.controller';
import { WebOrdersService } from './web-orders.service';

@Module({
  imports: [SalesModule],
  controllers: [WebOrdersController],
  providers: [WebOrdersService, WebOrderTokenService],
  exports: [WebOrderTokenService, WebOrdersService],
})
export class WebOrdersModule {}
