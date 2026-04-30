import { Controller, Get, Sse } from '@nestjs/common';
import type { PublicDisplayState } from '@pos-tercos/types';
import { type Observable } from 'rxjs';
import { Public } from '../auth/decorators/public.decorator';
import { PublicDisplayService } from './public-display.service';

@Controller('public-display')
@Public()
export class PublicDisplayController {
  constructor(private readonly svc: PublicDisplayService) {}

  @Get('state')
  state(): Promise<PublicDisplayState> {
    return this.svc.getState();
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.svc.stream();
  }
}
