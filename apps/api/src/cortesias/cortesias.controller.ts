import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { startOfBusinessDay } from '@pos-tercos/domain';
import {
  CortesiaStatusEnum,
  CreateCortesiaSchema,
  IDEMPOTENCY_HEADER,
  IdempotencyKeySchema,
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

  /** El cajero registra una cortesía: se aplica al instante (descuenta stock a
   * costo FIFO) y notifica al dueño. No requiere aprobación de admin. */
  @CashierAccess()
  @Post()
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(CreateCortesiaSchema)) body: CreateCortesia,
    @Headers(IDEMPOTENCY_HEADER) idemKey?: string,
  ): Promise<CortesiaRequest> {
    const idempotencyKey =
      idemKey && IdempotencyKeySchema.safeParse(idemKey).success ? idemKey : undefined;
    return this.cortesias.create(body, user.sub, idempotencyKey);
  }

  /**
   * Cortesías del día operativo para el historial de la caja: todas, sin
   * importar quién las registró (el historial de ventas tampoco filtra por
   * cajero). `from` es el inicio del día de negocio que manda la caja; sin él,
   * se calcula acá con el mismo corte de las 4 am.
   */
  @CashierAccess()
  @Get('day')
  day(@Query('from') from?: string): Promise<CortesiaRequest[]> {
    let since = startOfBusinessDay(new Date());
    if (from) {
      const parsed = new Date(from);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`Parámetro 'from' inválido: ${from}`);
      }
      // Piso de 48h: este endpoint es "las del día" para la caja. Sin piso,
      // un from=1970-01-01 devolvía el histórico completo de cortesías a
      // cualquier rol de caja. 48h cubre de sobra el corte de las 4 am.
      const floor = Date.now() - 48 * 60 * 60 * 1000;
      since = parsed.getTime() < floor ? new Date(floor) : parsed;
    }
    return this.cortesias.listSince(since);
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

  /** El admin ANULA una cortesía registrada por error: devuelve stock y la saca
   * del COGS de cortesías. Solo aplica a cortesías autorizadas. */
  @AdminAccess()
  @Post(':id/reverse')
  reverse(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveCortesiaSchema)) body: ResolveCortesia,
  ): Promise<CortesiaRequest> {
    return this.cortesias.reverse(id, user.sub, body.note);
  }
}
