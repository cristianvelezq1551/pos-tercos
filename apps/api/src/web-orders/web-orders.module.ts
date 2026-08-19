import { Module } from '@nestjs/common';
import { AddressModule } from '../adapters/address/address.module';
import { AuthModule } from '../auth/auth.module';
import { SalesModule } from '../sales/sales.module';
import { PosGateway } from './pos.gateway';
import { WebOrderDailyLimitGuard } from './web-order-daily-limit.guard';
import { AddressController } from './address.controller';
import { AddressTokenService } from './address-token.service';
import { WebOrderTokenService } from './web-order-token.service';
import { WebOrdersController } from './web-orders.controller';
import { WebOrdersService } from './web-orders.service';

@Module({
  imports: [SalesModule, AuthModule, AddressModule],
  controllers: [WebOrdersController, AddressController],
  providers: [
    WebOrdersService,
    WebOrderTokenService,
    AddressTokenService,
    PosGateway,
    WebOrderDailyLimitGuard,
  ],
  exports: [WebOrderTokenService, AddressTokenService, WebOrdersService, PosGateway],
})
export class WebOrdersModule {}
