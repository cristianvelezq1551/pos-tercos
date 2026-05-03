import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicMenuResponse } from '@pos-tercos/types';
import { Public } from '../auth/decorators/public.decorator';
import { WebMenuService } from './web-menu.service';

@Controller('web/menu')
@Public()
export class WebMenuController {
  constructor(private readonly menu: WebMenuService) {}

  /** 60 reqs / 60s por IP — el cliente puede refrescar el menú. */
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get()
  list(): Promise<PublicMenuResponse> {
    return this.menu.list();
  }
}
