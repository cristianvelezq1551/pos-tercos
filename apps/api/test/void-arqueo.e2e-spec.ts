/**
 * void-arqueo.e2e-spec.ts — Mutante M4 del informe de calidad (A6):
 * ningún test verificaba que una venta ANULADA salga del arqueo del turno.
 * Si alguien quitara VOID del `notIn` del esperado de caja o del detalle de
 * sesión, el descuadre sería silencioso. Este spec lo fija.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('VOID fuera del arqueo E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let cajeroId: string;
  let shiftId: string;
  let gaseosaId: string;

  const PRICE = 10_000;
  const OPENING = 50_000;

  const expectedCash = async (): Promise<number> => {
    const res = await request
      .get(`/shifts/${shiftId}/expected-cash`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(200);
    return res.body.expectedCash as number;
  };

  /** Movimientos del turno que NO existían antes (los que creó el void). */
  const movementsSince = async (knownIds: string[]) =>
    prisma.cashMovement.findMany({
      where: { shiftId, id: { notIn: knownIds } },
      orderBy: { createdAt: 'asc' },
    });

  const movementIds = async (): Promise<string[]> =>
    (await prisma.cashMovement.findMany({ where: { shiftId }, select: { id: true } })).map(
      (m) => m.id,
    );

  /**
   * Domicilio PAGADO creado por prisma: lo que se prueba es la devolución del
   * envío al anular, no el flujo de cobro web (ese vive en web-delivery).
   */
  const createPaidDeliverySale = async (input: {
    subtotal: number;
    fee: number;
    payments: Array<{ method: string; amount: number }>;
  }): Promise<string> => {
    const total = input.subtotal + input.fee;
    const sale = await prisma.sale.create({
      data: {
        type: 'WEB_DELIVERY',
        status: 'PAGADO',
        subtotal: input.subtotal,
        total, // CHECK: total = subtotal − descuento + delivery_fee
        deliveryFee: input.fee,
        deliveryAddress: 'Cra 43A #5-15, torre 2, apto 502',
        customerName: 'Cliente Domicilio Void',
        customerPhone: '+573001234567',
        paidAt: new Date(),
        // Cuenta dividida ⇒ sin método único (el resumen queda en NULL).
        paymentMethod: input.payments.length === 1 ? input.payments[0].method : null,
        cashierId: cajeroId,
        shiftId,
        items: {
          create: [
            {
              productId: gaseosaId,
              quantity: 1,
              unitPrice: input.subtotal,
              lineSubtotal: input.subtotal,
              lineTotal: input.subtotal,
            },
          ],
        },
        payments: {
          create: input.payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            amountReceived: p.amount,
          })),
        },
      },
    });
    return sale.id;
  };

  const voidSale = (saleId: string, reason: string) =>
    request
      .post(`/sales/${saleId}/void`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('X-Approval-Pin', '654321')
      .send({ reason })
      .expect(201);

  const paySale = async (): Promise<string> => {
    const created = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: gaseosaId, quantity: 1 }] })
      .expect(201);
    await request
      .post(`/sales/${created.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ method: 'CASH', amountReceived: PRICE })
      .expect(201);
    return created.body.id as string;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-void@test.local', fullName: 'Dueño Void', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-void@test.local', fullName: 'Cajero Void', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-void@test.local');
    cajeroToken = await loginAs(request, 'cajero-void@test.local');
    const cajero = await prisma.user.findUniqueOrThrow({
      where: { email: 'cajero-void@test.local' },
      select: { id: true },
    });
    cajeroId = cajero.id;

    const gaseosa = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Gaseosa Void',
        category: 'Bebidas',
        basePrice: PRICE,
        isActive: true,
        directResale: true,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'unit',
        unitStock: 'unit',
        conversionFactor: 1,
        thresholdMin: 0,
      })
      .expect(201);
    gaseosaId = gaseosa.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'PRODUCT', productId: gaseosaId, delta: 20, type: 'INITIAL', notes: 'stock test' })
      .expect(201);

    await request
      .post('/approvals/pin')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ pin: '654321', password: 'dev12345' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`PIN setup falló: ${res.status}`);
      });

    const shift = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: OPENING })
      .expect(201);
    shiftId = shift.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('anular una venta la saca del efectivo esperado Y del detalle del turno', async () => {
    await paySale();
    const toVoid = await paySale();

    // Antes del void: las 2 ventas suman al esperado.
    const before = await request
      .get(`/shifts/${shiftId}/expected-cash`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(200);
    expect(before.body.expectedCash).toBe(OPENING + 2 * PRICE);

    await request
      .post(`/sales/${toVoid}/void`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('X-Approval-Pin', '654321')
      .send({ reason: 'venta equivocada del test' })
      .expect(201);

    // El esperado baja EXACTAMENTE la venta anulada (no queda plata fantasma).
    const after = await request
      .get(`/shifts/${shiftId}/expected-cash`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .expect(200);
    expect(after.body.expectedCash).toBe(OPENING + PRICE);
    expect(after.body.cashSalesTotal).toBe(PRICE);

    // El detalle de sesión tampoco la cuenta como ingreso: revenue = 1×PRICE,
    // byMethod CASH sin la anulada, y el void queda contado como voidCount.
    const detail = await request
      .get(`/shifts/${shiftId}/detail`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(detail.body.summary.totalRevenue).toBe(PRICE);
    expect(detail.body.summary.cashRevenue).toBe(PRICE);
    expect(detail.body.summary.voidCount).toBe(1);
    const cash = detail.body.summary.byMethod.find(
      (m: { method: string }) => m.method === 'CASH',
    );
    expect(cash.total).toBe(PRICE);
  });

  // D1 (2026-08-25): al anular un domicilio se devuelve el TOTAL, envío incluido.
  // El esperado se auto-corrige solo por la parte NETA (las ventas van netas de
  // envío, §7.v30) → sin un OUT explícito por el envío, devolver el bruto dejaba
  // un faltante fantasma exactamente igual al envío.
  it('anular un domicilio con la caja ABIERTA devuelve también el envío (OUT) y el arqueo cuadra', async () => {
    const FOOD = 38_000;
    const FEE = 7_000;
    const saleId = await createPaidDeliverySale({
      subtotal: FOOD,
      fee: FEE,
      payments: [{ method: 'CASH', amount: FOOD + FEE }],
    });

    // El esperado ya cuenta solo la comida: el envío nunca estuvo en el cajón.
    const before = await expectedCash();
    const known = await movementIds();

    await voidSale(saleId, 'domicilio anulado en el test');

    // (a) Queda registrada la salida del envío, con su método y su motivo.
    const nuevos = await movementsSince(known);
    expect(nuevos).toHaveLength(1);
    const feeOut = nuevos[0];
    expect(feeOut.type).toBe('OUT');
    expect(feeOut.method).toBe('CASH');
    expect(Number(feeOut.amount)).toBe(FEE);
    expect(feeOut.reason).toContain('envío');

    // (b) El cajón espera $45.000 menos: la comida sale de las ventas y el
    //     envío sale por el movimiento. La devolución al cliente fue del bruto.
    expect(await expectedCash()).toBe(before - (FOOD + FEE));
  });

  // No-regresión: el OUT es EXCLUSIVO del envío. Una venta sin domicilio se
  // auto-corrige sola al anularse (sale del conjunto de ventas del esperado);
  // agregarle un movimiento la descontaría dos veces.
  it('anular una venta SIN envío no crea ningún movimiento de caja', async () => {
    const saleId = await paySale();
    const before = await expectedCash();
    const known = await movementIds();

    await voidSale(saleId, 'venta de mostrador anulada en el test');

    expect(await movementsSince(known)).toHaveLength(0);
    expect(await expectedCash()).toBe(before - PRICE);
  });

  // Cuenta dividida: la devolución del envío es method-aware. Mandar todo el
  // envío al efectivo descuadraría el cajón y dejaría el arqueo digital corto.
  it('domicilio con cuenta dividida: el envío se devuelve prorrateado por método', async () => {
    const FOOD = 36_000;
    const FEE = 9_000;
    const CASH_PART = 15_000; // 1/3 del total ⇒ le toca 1/3 del envío ($3.000)
    const TRANSFER_PART = 30_000; // 2/3 ⇒ $6.000
    const saleId = await createPaidDeliverySale({
      subtotal: FOOD,
      fee: FEE,
      payments: [
        { method: 'CASH', amount: CASH_PART },
        { method: 'TRANSFER', amount: TRANSFER_PART },
      ],
    });

    const before = await expectedCash();
    const known = await movementIds();

    await voidSale(saleId, 'domicilio dividido anulado en el test');

    const nuevos = await movementsSince(known);
    expect(nuevos).toHaveLength(2);
    expect(nuevos.every((m) => m.type === 'OUT')).toBe(true);
    const byMethod = new Map(nuevos.map((m) => [m.method, Number(m.amount)]));
    expect(byMethod.get('CASH')).toBe(3_000);
    expect(byMethod.get('TRANSFER')).toBe(6_000);
    // La suma de los OUT es EXACTAMENTE el envío (el remanente de redondeo va
    // a la última parte): ni un peso de más ni de menos.
    expect([...byMethod.values()].reduce((a, b) => a + b, 0)).toBe(FEE);

    // El cajón baja solo la parte que se pagó en efectivo ($12.000 netos de la
    // venta + $3.000 del envío), no el total de la venta.
    expect(await expectedCash()).toBe(before - CASH_PART);
  });
});
