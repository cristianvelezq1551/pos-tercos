import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  PublicDisplayOrderItem,
  PublicDisplayState,
  ReadyToCallOrder,
  ReadyToCallResponse,
  TurnResponse,
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

const ITEMS_LIMIT = 4;
/** La cola del cajero solo muestra listos del día (no arrastra olvidados). */
const READY_QUEUE_TYPES = ['COUNTER', 'WEB_PICKUP'] as const;

type SaleItemRow = {
  quantity: number;
  product: { name: string; imageUrl: string | null };
};

@Injectable()
export class PublicDisplayService {
  private readonly logger = new Logger(PublicDisplayService.name);
  private readonly notifications = new Subject<void>();

  /** Estado en vivo del llamado. `seq` es monotónico → re-flashea aunque el
   *  número no cambie (re-llamado). Se rehidrata del último calledAt al boot. */
  private currentTurn: number | null = null;
  private callSeq = 0;
  private rehydrated = false;

  constructor(private readonly prisma: PrismaService) {}

  notify(): void {
    this.notifications.next();
  }

  /** Llama un turno desde una venta lista: marca calledAt + lo pone en pantalla. */
  async callSale(saleId: string): Promise<TurnResponse> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, turnNumber: true, status: true },
    });
    if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
    if (sale.turnNumber === null) {
      throw new NotFoundException(`Sale ${saleId} no tiene turno asignado`);
    }
    await this.prisma.sale.update({
      where: { id: saleId },
      data: { calledAt: new Date() },
    });
    this.currentTurn = sale.turnNumber;
    this.callSeq += 1;
    this.notify();
    return this.turnResponse();
  }

  /** Llamado manual de un número arbitrario (corrección de desfase). */
  callManual(turn: number): TurnResponse {
    this.currentTurn = turn;
    this.callSeq += 1;
    this.notify();
    return this.turnResponse();
  }

  /** Marca el pedido como ENTREGADO → sale de la cola del cajero. */
  async markDelivered(saleId: string, userId: string): Promise<void> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: { status: true },
    });
    if (!sale) throw new NotFoundException(`Sale ${saleId} not found`);
    if (sale.status !== 'LISTO_DESPACHO') {
      // Idempotente: si ya está entregado/otro estado, no hacemos nada.
      this.notify();
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: saleId },
        data: { status: 'ENTREGADO' },
      });
      await tx.saleStatusLog.create({
        data: {
          saleId,
          statusFrom: 'LISTO_DESPACHO',
          statusTo: 'ENTREGADO',
          userId,
          notes: 'Entregado al cliente',
        },
      });
    });
    this.notify();
  }

  /** Limpia la pantalla (vuelve a "sin turno"). */
  reset(): TurnResponse {
    this.currentTurn = null;
    this.callSeq += 1;
    this.notify();
    return this.turnResponse();
  }

  /** Cola "listos por llamar" del cajero: LISTO_DESPACHO del día, FIFO por readyAt. */
  async getReadyToCall(): Promise<ReadyToCallResponse> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = await this.prisma.sale.findMany({
      where: {
        status: 'LISTO_DESPACHO',
        type: { in: [...READY_QUEUE_TYPES] },
        readyAt: { gte: startOfDay },
      },
      orderBy: { readyAt: 'asc' },
      select: {
        id: true,
        turnNumber: true,
        type: true,
        customerName: true,
        readyAt: true,
        calledAt: true,
        items: {
          orderBy: { id: 'asc' },
          take: ITEMS_LIMIT,
          select: {
            quantity: true,
            product: { select: { name: true, imageUrl: true } },
          },
        },
      },
    });

    const orders: ReadyToCallOrder[] = rows
      .filter((r) => r.turnNumber !== null && r.readyAt !== null)
      .map((r) => ({
        saleId: r.id,
        turnNumber: r.turnNumber!,
        type: r.type,
        customerName: r.customerName,
        readyAt: r.readyAt!.toISOString(),
        calledAt: r.calledAt?.toISOString() ?? null,
        items: this.mapItems(r.items),
      }));

    return { orders, asOf: new Date().toISOString() };
  }

  async getState(): Promise<PublicDisplayState> {
    await this.ensureRehydrated();
    return {
      currentTurn: this.currentTurn,
      callSeq: this.callSeq,
      asOf: new Date().toISOString(),
    };
  }

  private turnResponse(): TurnResponse {
    return { currentTurn: this.currentTurn, callSeq: this.callSeq };
  }

  /** Al primer acceso tras un reinicio, recupera el último turno llamado hoy
   *  para que la pantalla no quede en blanco. Best-effort. */
  private async ensureRehydrated(): Promise<void> {
    if (this.rehydrated) return;
    this.rehydrated = true;
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const last = await this.prisma.sale.findFirst({
        where: { calledAt: { gte: startOfDay } },
        orderBy: { calledAt: 'desc' },
        select: { turnNumber: true },
      });
      if (last?.turnNumber != null) {
        this.currentTurn = last.turnNumber;
      }
    } catch (err) {
      this.logger.warn(`No se pudo rehidratar el turno: ${String(err)}`);
    }
  }

  private mapItems(rows: SaleItemRow[]): PublicDisplayOrderItem[] {
    return rows.slice(0, ITEMS_LIMIT).map((r) => ({
      productName: r.product.name,
      imageUrl: r.product.imageUrl,
      quantity: r.quantity,
    }));
  }

  /**
   * Stream SSE: snapshot inicial + cada `notify()`. Keepalive cada 20 s para
   * que proxies no corten la conexión idle.
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
