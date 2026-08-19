import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CreatePaymentMethodSchema,
  UpdatePaymentMethodSchema,
  type CreatePaymentMethod,
  type PaymentMethodSetting,
  type UpdatePaymentMethod,
  type JwtAccessPayload,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, CashierAccess, OnlyDueno } from '../auth/decorators/roles.decorator';
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

  // §3.8: las ESCRITURAS son Dueño-only. El operativo que cobra no debe poder
  // apagar `requiresVerification` de un método digital y auto-confirmarse pagos
  // sin doble verificación (era AdminAccess → superficie de fraude).
  /** Crear un medio de pago custom (digital). Solo Dueño. */
  @OnlyDueno()
  @Post()
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreatePaymentMethodSchema)) body: CreatePaymentMethod,
  ): Promise<PaymentMethodSetting> {
    return this.methods.create(body, user.sub);
  }

  /** Editar un medio de pago (nombre, habilitado, verificación, reconciliación, orden). Solo Dueño. */
  @OnlyDueno()
  @Patch(':code')
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(UpdatePaymentMethodSchema)) body: UpdatePaymentMethod,
  ): Promise<PaymentMethodSetting> {
    return this.methods.update(code, body, user.sub);
  }

  /** Borrar un medio de pago (no built-in de sistema). Solo Dueño. */
  @OnlyDueno()
  @Delete(':code')
  async remove(
    @CurrentUser() user: JwtAccessPayload,
    @Param('code') code: string,
  ): Promise<{ ok: true }> {
    await this.methods.remove(code, user.sub);
    return { ok: true };
  }
}
