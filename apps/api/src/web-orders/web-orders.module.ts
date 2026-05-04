import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SalesModule } from '../sales/sales.module';
import { PosGateway } from './pos.gateway';
import { WebOrderTokenService } from './web-order-token.service';
import { WebOrdersController } from './web-orders.controller';
import { WebOrdersService } from './web-orders.service';

@Module({
  imports: [SalesModule, AuthModule],
  controllers: [WebOrdersController],
  providers: [WebOrdersService, WebOrderTokenService, PosGateway],
  exports: [WebOrderTokenService, WebOrdersService, PosGateway],
})
export class WebOrdersModule {}
