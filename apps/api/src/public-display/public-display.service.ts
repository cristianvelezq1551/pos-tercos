import { Injectable, Logger } from '@nestjs/common';
import type {
  PublicDisplayOrder,
  PublicDisplayState,
} from '@pos-tercos/types';
import { concat, defer, from, map, Subject, switchMap, type Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** Solo COUNTER y limitado a las últimas X minutos para evitar mostrar
 * órdenes "olvidadas" en la pantalla. */
const CURRENT_WINDOW_MS = 30 * 60 * 1000; // 30 min
const NEXT_LIMIT = 2;

@Injectable()
export class PublicDisplayService {
  private readonly logger = new Logger(PublicDisplayService.name);
  private readonly notifications = new Subject<void>();

  constructor(private readonly prisma: PrismaService) {}

  notify(): void {
    this.notifications.next();
  }

  async getState(): Promise<PublicDisplayState> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - CURRENT_WINDOW_MS);

    // "current": la última transición LISTO_DESPACHO de un Sale type=COUNTER
    // que SIGUE en ese estado, dentro de la ventana de 30 min. Sale no tiene
    // updatedAt — derivamos el timestamp desde sale_status_log.
    const currentLog = await this.prisma.saleStatusLog.findFirst({
      where: {
        statusTo: 'LISTO_DESPACHO',
        changedAt: { gte: windowStart },
        sale: { type: 'COUNTER', status: 'LISTO_DESPACHO' },
      },
      orderBy: { changedAt: 'desc' },
      include: {
        sale: {
          select: { id: true, receiptNumber: true, customerName: true },
        },
      },
    });

    const nextRows = await this.prisma.sale.findMany({
      where: {
        type: 'COUNTER',
        status: { in: ['PAGADO', 'EN_PREPARACION'] },
        paidAt: { not: null },
      },
      orderBy: { paidAt: 'asc' },
      take: NEXT_LIMIT,
      select: {
        id: true,
        receiptNumber: true,
        customerName: true,
        paidAt: true,
      },
    });

    const current: PublicDisplayOrder | null = currentLog
      ? {
          saleId: currentLog.sale.id,
          receiptNumber: Number(currentLog.sale.receiptNumber),
          customerName: currentLog.sale.customerName,
          at: currentLog.changedAt.toISOString(),
        }
      : null;

    const next: PublicDisplayOrder[] = nextRows.map((r) => ({
      saleId: r.id,
      receiptNumber: Number(r.receiptNumber),
      customerName: r.customerName,
      at: r.paidAt!.toISOString(),
    }));

    return { current, next, asOf: now.toISOString() };
  }

  /**
   * Stream SSE: emite snapshot inicial + cada vez que `notify()` se llama,
   * recalcula y empuja el state nuevo.
   */
  stream(): Observable<MessageEvent> {
    const initial$ = defer(() => from(this.getState()));
    const updates$ = this.notifications.pipe(
      switchMap(() => from(this.getState())),
    );
    return concat(initial$, updates$).pipe(
      map((state) => ({ data: state }) as MessageEvent),
    );
  }
}
