import { Injectable, Logger } from '@nestjs/common';
import type {
  PublicDisplayOrder,
  PublicDisplayOrderItem,
  PublicDisplayState,
} from '@pos-tercos/types';
import {
  concat,
  defer,
  from,
  interval,
  map,
  merge,
  Subject,
  switchMap,
  type Observable,
} from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** Solo COUNTER y limitado a las últimas X minutos para evitar mostrar
 * órdenes "olvidadas" en la pantalla. */
const CURRENT_WINDOW_MS = 30 * 60 * 1000; // 30 min
const NEXT_LIMIT = 2;
const ITEMS_LIMIT = 4;

type SaleItemRow = {
  id: string;
  quantity: number;
  product: { name: string; imageUrl: string | null };
};

@Injectable()
export class PublicDisplayService {
  private readonly logger = new Logger(PublicDisplayService.name);
  private readonly notifications = new Subject<void>();
  private currentTurn = 1;

  constructor(private readonly prisma: PrismaService) {}

  notify(): void {
    this.notifications.next();
  }

  getCurrentTurn(): number {
    return this.currentTurn;
  }

  advanceTurn(): number {
    this.currentTurn = Math.min(this.currentTurn + 1, 9999);
    this.notify();
    return this.currentTurn;
  }

  setTurn(value: number): number {
    this.currentTurn = Math.min(Math.max(value, 1), 9999);
    this.notify();
    return this.currentTurn;
  }

  resetTurn(): number {
    this.currentTurn = 1;
    this.notify();
    return this.currentTurn;
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
          select: {
            id: true,
            receiptNumber: true,
            customerName: true,
            items: {
              orderBy: { id: 'asc' },
              take: ITEMS_LIMIT,
              select: {
                id: true,
                quantity: true,
                product: { select: { name: true, imageUrl: true } },
              },
            },
          },
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
        items: {
          orderBy: { id: 'asc' },
          take: ITEMS_LIMIT,
          select: {
            id: true,
            quantity: true,
            product: { select: { name: true, imageUrl: true } },
          },
        },
      },
    });

    const current: PublicDisplayOrder | null = currentLog
      ? {
          saleId: currentLog.sale.id,
          receiptNumber: Number(currentLog.sale.receiptNumber),
          customerName: currentLog.sale.customerName,
          at: currentLog.changedAt.toISOString(),
          items: this.mapItems(currentLog.sale.items),
        }
      : null;

    const next: PublicDisplayOrder[] = nextRows.map((r) => ({
      saleId: r.id,
      receiptNumber: Number(r.receiptNumber),
      customerName: r.customerName,
      at: r.paidAt!.toISOString(),
      items: this.mapItems(r.items),
    }));

    return {
      current,
      next,
      asOf: now.toISOString(),
      currentTurn: this.currentTurn,
    };
  }

  private mapItems(rows: SaleItemRow[]): PublicDisplayOrderItem[] {
    return rows.slice(0, ITEMS_LIMIT).map((r) => ({
      productName: r.product.name,
      imageUrl: r.product.imageUrl,
      quantity: r.quantity,
    }));
  }

  /**
   * Stream SSE: emite snapshot inicial + cada vez que `notify()` se llama,
   * recalcula y empuja el state nuevo. Además un keepalive cada 20 s (evento
   * `ping` que el cliente ignora) para que proxies/balanceadores no corten la
   * conexión idle durante horas muertas.
   */
  stream(): Observable<MessageEvent> {
    const initial$ = defer(() => from(this.getState()));
    const updates$ = this.notifications.pipe(
      switchMap(() => from(this.getState())),
    );
    const data$ = concat(initial$, updates$).pipe(
      map((state) => ({ data: state }) as MessageEvent),
    );
    const keepalive$ = interval(20_000).pipe(
      map(() => ({ type: 'ping', data: '' }) as MessageEvent),
    );
    return merge(data$, keepalive$);
  }
}
