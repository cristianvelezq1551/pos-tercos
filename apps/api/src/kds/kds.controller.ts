import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { JwtAccessPayload, Sale } from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KitchenAccess } from '../auth/decorators/roles.decorator';
import { KdsGateway } from './kds.gateway';
import { KdsService } from './kds.service';

@Controller('kds/orders')
@KitchenAccess()
export class KdsController {
  constructor(
    private readonly kds: KdsService,
    private readonly gateway: KdsGateway,
  ) {}

  @Get()
  list(): Promise<Sale[]> {
    return this.kds.getQueue();
  }

  @Post(':id/start')
  @HttpCode(200)
  async start(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    const sale = await this.kds.start(id, user.sub);
    this.gateway.emit('order.status.changed', sale);
    return sale;
  }

  @Post(':id/ready')
  @HttpCode(200)
  async ready(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    const sale = await this.kds.ready(id, user.sub);
    this.gateway.emit('order.status.changed', sale);
    return sale;
  }
}
