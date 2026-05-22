import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { JwtAccessPayload, Sale } from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  KitchenAccess,
  KitchenOrCashierAccess,
} from '../auth/decorators/roles.decorator';
import { KdsService } from './kds.service';

@Controller('kds/orders')
export class KdsController {
  constructor(private readonly kds: KdsService) {}

  @KitchenAccess()
  @Get()
  list(): Promise<Sale[]> {
    return this.kds.getQueue();
  }

  // Cocina o caja (el cajero avanza si el cocinero está ocupado). El emit al
  // board del KDS se hace dentro de KdsService.transition.
  @KitchenOrCashierAccess()
  @Post(':id/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    return this.kds.start(id, user.sub);
  }

  /** `silent=true` (cajero, actualización retroactiva offline) → no avisa al cliente. */
  @KitchenOrCashierAccess()
  @Post(':id/ready')
  @HttpCode(200)
  ready(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('silent') silent?: string,
  ): Promise<Sale> {
    return this.kds.ready(id, user.sub, silent === 'true');
  }
}
