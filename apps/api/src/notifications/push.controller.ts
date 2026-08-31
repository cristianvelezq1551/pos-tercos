import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  PushSubscriptionInputSchema,
  PushUnsubscribeSchema,
  type JwtAccessPayload,
  type PushSendOutcome,
  type PushStatus,
  type PushSubscriptionInput,
  type PushUnsubscribe,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PushSubscriptionsService } from './push-subscriptions.service';

/**
 * Notificaciones del navegador. Todo el módulo es Admin Operativo + Dueño:
 * son ellos los destinatarios de las alertas de negocio.
 */
@Controller('push')
export class PushController {
  constructor(private readonly service: PushSubscriptionsService) {}

  /**
   * Llave pública VAPID + los dispositivos de quien pregunta. Va junto porque
   * la pantalla necesita las dos cosas para dibujarse una sola vez.
   */
  @AdminAccess()
  @Get('status')
  async status(
    @CurrentUser() user: JwtAccessPayload,
    @Query('endpoint') endpoint?: string,
  ): Promise<PushStatus> {
    return {
      publicKey: this.service.publicKey,
      devices: await this.service.listDevices(user.sub, endpoint),
    };
  }

  @AdminAccess()
  @Post('subscribe')
  @HttpCode(204)
  async subscribe(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(PushSubscriptionInputSchema)) body: PushSubscriptionInput,
  ): Promise<void> {
    await this.service.subscribe(user.sub, body);
  }

  @AdminAccess()
  @Post('unsubscribe')
  @HttpCode(204)
  async unsubscribe(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(PushUnsubscribeSchema)) body: PushUnsubscribe,
  ): Promise<void> {
    await this.service.unsubscribe(user.sub, body.endpoint);
  }

  /**
   * Manda un aviso de prueba a los dispositivos de quien lo pide. Existe por lo
   * mismo que `POST /healthz/alert-drill`: una alarma que nadie probó es una
   * alarma que no se sabe si suena — así estuvo el WhatsApp, mudo, meses.
   */
  @AdminAccess()
  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser() user: JwtAccessPayload): Promise<PushSendOutcome> {
    return this.service.sendToUser(user.sub, {
      title: 'Prueba de avisos',
      body: 'Si ves esto, las notificaciones de este dispositivo funcionan.',
      url: '/avisos',
      tag: 'prueba',
    });
  }
}
