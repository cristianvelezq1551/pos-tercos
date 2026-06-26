import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CortesiaStatusEnum,
  CreateCortesiaSchema,
  ResolveCortesiaSchema,
  type CortesiaGivenSummary,
  type CortesiaRequest,
  type CortesiaStatus,
  type CreateCortesia,
  type JwtAccessPayload,
  type ResolveCortesia,
} from '@pos-tercos/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminAccess, CashierAccess } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CortesiasService } from './cortesias.service';

@Controller('cortesias')
export class CortesiasController {
  constructor(private readonly cortesias: CortesiasService) {}

  /** El cajero solicita una cortesía (descuenta stock; queda PENDING). */
  @CashierAccess()
  @Post()
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreateCortesiaSchema)) body: CreateCortesia,
  ): Promise<CortesiaRequest> {
    return this.cortesias.create(body, user.sub);
  }

  /** Cortesías del cajero actual (estado + novedades para acusar). */
  @CashierAccess()
  @Get('mine')
  listMine(@CurrentUser() user: JwtAccessPayload): Promise<CortesiaRequest[]> {
    return this.cortesias.listMine(user.sub);
  }

  /** El cajero marca como vista una cortesía observada. */
  @CashierAccess()
  @Post(':id/ack')
  ack(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CortesiaRequest> {
    return this.cortesias.ack(id, user.sub);
  }

  /** Total dado en cortesías (autorizadas) del mes — FIFO, igual al P&G. */
  @AdminAccess()
  @Get('given-summary')
  givenSummary(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<CortesiaGivenSummary> {
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;
    return this.cortesias.givenSummaryForMonth(y, m);
  }

  /** Panel de Solicitudes (admin/dueño). status CSV opcional. */
  @AdminAccess()
  @Get()
  list(@Query('status') status?: string): Promise<CortesiaRequest[]> {
    const parsed = (status ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s): s is CortesiaStatus => CortesiaStatusEnum.safeParse(s).success);
    return this.cortesias.list(parsed.length > 0 ? parsed : undefined);
  }

  @AdminAccess()
  @Post(':id/approve')
  approve(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveCortesiaSchema)) body: ResolveCortesia,
  ): Promise<CortesiaRequest> {
    return this.cortesias.approve(id, user.sub, body.note);
  }

  @AdminAccess()
  @Post(':id/reject')
  reject(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveCortesiaSchema)) body: ResolveCortesia,
  ): Promise<CortesiaRequest> {
    return this.cortesias.reject(id, user.sub, body.note);
  }
}
