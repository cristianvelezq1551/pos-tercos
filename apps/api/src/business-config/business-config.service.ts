import { Injectable } from '@nestjs/common';
import type { BusinessConfig, UpdateBusinessConfig } from '@pos-tercos/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const SINGLETON_ID = 'singleton';

/**
 * Config global del negocio (fila única). Hoy solo expone `monthStartDay`, el
 * día de corte del "mes del negocio" usado por el estado financiero.
 */
@Injectable()
export class BusinessConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<BusinessConfig> {
    const row = await this.prisma.businessConfig.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
    return { monthStartDay: row.monthStartDay };
  }

  /** Atajo para los reportes: día (1–28) en que arranca el mes del negocio. */
  async getMonthStartDay(): Promise<number> {
    return (await this.get()).monthStartDay;
  }

  /**
   * Ventana del "mes del negocio" `(year, month1)` (month1: 1-12) en HORA LOCAL
   * del servidor. En prod el server corre `TZ=America/Bogota` → la ventana queda
   * anclada a medianoche de Bogotá, IDÉNTICA a la convención de `parseDateRange`
   * (reports.controller) que usan /reports/sales y el resto del tablero.
   *
   * ⚠️ NO usar `Date.UTC(...)` acá: una venta cobrada a las 22:00 Bogotá se guarda
   * en UTC (03:00 del día siguiente) y con límites UTC caería en otro día/mes →
   * `/finanzas/estado` y `/reports/sales` mostrarían ingresos distintos para el
   * mismo período. Esta es la fuente ÚNICA de la ventana mensual para que
   * estado, pagos y cortesías coincidan entre sí y con el resto de reportes.
   *
   * startDay=1 (default) ⇒ mes calendario exacto.
   */
  async getBusinessMonthWindow(
    year: number,
    month1: number,
  ): Promise<{ from: Date; to: Date }> {
    const month0 = month1 - 1;
    const startDay = await this.getMonthStartDay();
    const from = new Date(year, month0, startDay, 0, 0, 0, 0);
    const to = new Date(year, month0 + 1, startDay - 1, 23, 59, 59, 999);
    return { from, to };
  }

  async update(input: UpdateBusinessConfig, actorId: string): Promise<BusinessConfig> {
    const before = await this.get();
    const row = await this.prisma.businessConfig.upsert({
      where: { id: SINGLETON_ID },
      update: { monthStartDay: input.monthStartDay },
      create: { id: SINGLETON_ID, monthStartDay: input.monthStartDay },
    });
    await this.audit.log({
      userId: actorId,
      action: 'BUSINESS_CONFIG_UPDATED',
      entityType: 'business_config',
      entityId: SINGLETON_ID,
      before,
      after: { monthStartDay: row.monthStartDay },
    });
    return { monthStartDay: row.monthStartDay };
  }
}
