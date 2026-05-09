import { Body, Controller, Get, Post, Sse } from '@nestjs/common';
import {
  SetTurnSchema,
  type PublicDisplayState,
  type SetTurn,
  type TurnResponse,
} from '@pos-tercos/types';
import { type Observable } from 'rxjs';
import { CashierAccess } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PublicDisplayService } from './public-display.service';

@Controller('public-display')
export class PublicDisplayController {
  constructor(private readonly svc: PublicDisplayService) {}

  @Get('state')
  @Public()
  state(): Promise<PublicDisplayState> {
    return this.svc.getState();
  }

  @Sse('stream')
  @Public()
  stream(): Observable<MessageEvent> {
    return this.svc.stream();
  }

  @Post('turn/advance')
  @CashierAccess()
  advanceTurn(): TurnResponse {
    return { currentTurn: this.svc.advanceTurn() };
  }

  @Post('turn')
  @CashierAccess()
  setTurn(
    @Body(new ZodValidationPipe(SetTurnSchema)) body: SetTurn,
  ): TurnResponse {
    return { currentTurn: this.svc.setTurn(body.value) };
  }

  @Post('turn/reset')
  @CashierAccess()
  resetTurn(): TurnResponse {
    return { currentTurn: this.svc.resetTurn() };
  }
}
