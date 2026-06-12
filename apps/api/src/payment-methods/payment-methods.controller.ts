import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  UpdatePaymentMethodsSchema,
  type PaymentMethodSetting,
  type UpdatePaymentMethods,
  type JwtAccessPayload,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, CashierAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  /** Métodos habilitados — lo que el POS ofrece al cobrar. */
  @CashierAccess()
  @Get()
  listEnabled(): Promise<PaymentMethodSetting[]> {
    return this.methods.listEnabled();
  }

  /** Catálogo completo con flags (pantalla de configuración del admin). */
  @AdminAccess()
  @Get('all')
  listAll(): Promise<PaymentMethodSetting[]> {
    return this.methods.listAll();
  }

  /** Habilitar/deshabilitar métodos. Admin/Dueño. */
  @AdminAccess()
  @Put()
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(UpdatePaymentMethodsSchema)) body: UpdatePaymentMethods,
  ): Promise<PaymentMethodSetting[]> {
    return this.methods.update(body, user.sub);
  }
}
