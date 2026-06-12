import { Global, Module } from '@nestjs/common';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';

/** @Global: SalesService valida métodos habilitados en cada cobro. */
@Global()
@Module({
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
