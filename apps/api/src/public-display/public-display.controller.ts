import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Sse } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CallManualSchema,
  type CallManual,
  type JwtAccessPayload,
  type PublicDisplayState,
  type ReadyToCallResponse,
  type TurnResponse,
} from '@pos-tercos/types';
import { type Observable } from 'rxjs';
import { CashierAccess } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PublicDisplayService } from './public-display.service';

@Controller('public-display')
export class PublicDisplayController {
  constructor(private readonly svc: PublicDisplayService) {}

  @Get('state')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  state(): Promise<PublicDisplayState> {
    return this.svc.getState();
  }

  @Sse('stream')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } }) // anti-flood de conexiones SSE
  stream(): Observable<MessageEvent> {
    return this.svc.stream();
  }

  /** Cola "listos por llamar" del cajero. */
  @Get('ready-to-call')
  @CashierAccess()
  readyToCall(): Promise<ReadyToCallResponse> {
    return this.svc.getReadyToCall();
  }

  /** Llama un turno desde una venta lista (lo pone en la pantalla pública). */
  @Post('call/:saleId')
  @CashierAccess()
  call(@Param('saleId', ParseUUIDPipe) saleId: string): Promise<TurnResponse> {
    return this.svc.callSale(saleId);
  }

  /** Llamado manual de un número arbitrario (corrección de desfase). */
  @Post('call-manual')
  @CashierAccess()
  callManual(
    @Body(new ZodValidationPipe(CallManualSchema)) body: CallManual,
  ): TurnResponse {
    return this.svc.callManual(body.turn);
  }

  /** Marca el pedido entregado → sale de la cola del cajero. */
  @Post('deliver/:saleId')
  @CashierAccess()
  async deliver(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<{ ok: true }> {
    await this.svc.markDelivered(saleId, user.sub);
    return { ok: true };
  }

  /** Limpia la pantalla. */
  @Post('turn/reset')
  @CashierAccess()
  resetTurn(): TurnResponse {
    return this.svc.reset();
  }
}
