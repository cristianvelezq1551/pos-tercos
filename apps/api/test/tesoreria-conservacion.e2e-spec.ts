/**
 * tesoreria-conservacion.e2e-spec.ts — la identidad de los bolsillos.
 *
 * Tesorería es la pantalla donde el dueño lee "cuánta plata tengo", y arma ese
 * saldo sumando SIETE fuentes distintas: pagos de venta, facturas de compra,
 * costos fijos, dos tablas de nómina, compromisos y movimientos manuales. Cada
 * una tiene su suite; lo que nadie verificaba es la identidad completa:
 *
 *     saldo = inicial + cobrado − pagado + traspasos + ajustes
 *
 * y que cada peso caiga en UN solo bolsillo. Es la misma costura donde
 * aparecieron los hallazgos del inventario: cada módulo se ve coherente solo, y
 * el error vive en la suma.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { hoyLocal } from './helpers/local-day';

interface Bolsillo {
  initial: number;
  income: number;
  expensesPaid: number;
  transfersIn: number;
  transfersOut: number;
  adjustments: number;
  balance: number;
}
interface Resumen {
  cash: Bolsillo;
  bank: Bolsillo;
  total: number;
  commitmentsTotal: number;
  projected: number;
}

const INICIAL_EFECTIVO = 500_000;
const INICIAL_CUENTA = 2_000_000;

describe('Tesorería: la identidad de los bolsillos E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let productId: string;

  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

  const resumen = async (): Promise<Resumen> =>
    (await request.get('/treasury/summary').set(auth()).expect(200)).body as Resumen;

  /** El saldo de un bolsillo tiene que ser sus propios movimientos, no otra cosa. */
  const cuadra = (b: Bolsillo): void => {
    expect(
      b.initial + b.income - b.expensesPaid + b.transfersIn - b.transfersOut + b.adjustments,
    ).toBeCloseTo(b.balance, 2);
  };

  const vender = async (
    partes: Array<{ method: string; amount: number }>,
    extra: Record<string, unknown> = {},
  ): Promise<string> => {
    const total = partes.reduce((a, p) => a + p.amount, 0);
    const creada = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }], ...extra })
      .expect(201);
    const id = creada.body.id as string;
    // El precio del producto define el total: se ajusta con un descuento para
    // que las partes sumen exacto lo que pide el caso.
    const cuerpo =
      partes.length === 1
        ? {
            method: partes[0]!.method,
            amountReceived: total,
            digitalDoubleVerified: partes[0]!.method !== 'CASH',
          }
        : { payments: partes.map((p) => ({ ...p, digitalVerified: p.method !== 'CASH' })) };
    await request.post(`/sales/${id}/confirm-payment`).set(auth()).send(cuerpo).expect(201);
    return id;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-tesoreria@test.local',
        fullName: 'Dueño Tesorería',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-tesoreria@test.local');

    // El ancla: la plata que el dueño contó el día que empezó a usar el módulo.
    await request
      .patch('/treasury/config')
      .set(auth())
      // El ancla es HOY: los saldos iniciales son lo que el dueño contó ese
      // día, y desde ahí en adelante el módulo sigue la plata. Lo anterior al
      // ancla ya está implícito en el conteo, por eso no se vuelve a sumar.
      .send({
        anchorDate: hoyLocal(),
        initialCash: INICIAL_EFECTIVO,
        initialBank: INICIAL_CUENTA,
      })
      .expect(200);

    productId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Bebidas',
          name: 'Gaseosa Tesoro',
          basePrice: 10_000,
          directResale: true,
          unitPurchase: 'caja',
          unitStock: 'unidad',
          conversionFactor: 24,
          thresholdMin: 0,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId, delta: 500, type: 'INITIAL', unitCost: 3_000 })
      .expect(201);

    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('sin operación, el saldo es exactamente lo que se contó al anclar', async () => {
    const r = await resumen();
    expect(r.cash.initial).toBe(INICIAL_EFECTIVO);
    expect(r.bank.initial).toBe(INICIAL_CUENTA);
    expect(r.total).toBe(INICIAL_EFECTIVO + INICIAL_CUENTA);
    cuadra(r.cash);
    cuadra(r.bank);
  });

  it('cobrar en efectivo y por transferencia manda cada peso a SU bolsillo', async () => {
    const antes = await resumen();
    await vender([{ method: 'CASH', amount: 10_000 }]);
    await vender([{ method: 'TRANSFER', amount: 10_000 }]);
    const despues = await resumen();

    expect(despues.cash.income - antes.cash.income).toBeCloseTo(10_000, 2);
    expect(despues.bank.income - antes.bank.income).toBeCloseTo(10_000, 2);
    expect(despues.total - antes.total).toBeCloseTo(20_000, 2);
    cuadra(despues.cash);
    cuadra(despues.bank);
  });

  it('una cuenta dividida reparte el cobro entre los dos bolsillos', async () => {
    const antes = await resumen();
    await vender([
      { method: 'CASH', amount: 4_000 },
      { method: 'TRANSFER', amount: 6_000 },
    ]);
    const despues = await resumen();

    expect(despues.cash.income - antes.cash.income).toBeCloseTo(4_000, 2);
    expect(despues.bank.income - antes.bank.income).toBeCloseTo(6_000, 2);
    // Y el total se mueve por el total de la venta, ni un peso más.
    expect(despues.total - antes.total).toBeCloseTo(10_000, 2);
  });

  it('el domicilio NO entra a los bolsillos: es plata del repartidor', async () => {
    // §7.v30: al domiciliario se le paga al entregar, de cualquier medio. Si el
    // envío entrara al bolsillo, el saldo diría que hay una plata que ya salió.
    const antes = await resumen();
    const creada = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'WEB_DELIVERY',
        items: [{ productId, quantity: 1 }],
        customerName: 'Cliente Tesoro',
        customerPhone: '+573001112233',
        deliveryAddress: 'Calle 50 # 10-20, Bogotá',
      })
      .expect(201);
    const saleId = creada.body.id as string;
    await request
      .patch(`/sales/${saleId}/delivery-fee`)
      .set(auth())
      .send({ fee: 5_000 })
      .expect(200);
    await request
      .post(`/sales/${saleId}/confirm-payment`)
      .set(auth())
      .send({ method: 'TRANSFER', amountReceived: 15_000, digitalDoubleVerified: true })
      .expect(201);

    const despues = await resumen();
    // Entraron $15.000 pero solo $10.000 son del negocio.
    expect(despues.bank.income - antes.bank.income).toBeCloseTo(10_000, 2);
  });

  it('un traspaso mueve plata entre bolsillos sin cambiar el total', async () => {
    const antes = await resumen();
    await request
      .post('/treasury/transfer')
      .set(auth())
      .send({
        fromPocket: 'EFECTIVO',
        toPocket: 'CUENTA',
        amount: 120_000,
        reason: 'Consignación del día',
      })
      .expect(201);
    const despues = await resumen();

    expect(despues.cash.balance).toBeCloseTo(antes.cash.balance - 120_000, 2);
    expect(despues.bank.balance).toBeCloseTo(antes.bank.balance + 120_000, 2);
    // La plata no se crea ni se destruye al cambiarla de lugar.
    expect(despues.total).toBeCloseTo(antes.total, 2);
    cuadra(despues.cash);
    cuadra(despues.bank);
  });

  it('pagar una factura de compra baja el bolsillo con el que se pagó', async () => {
    const antes = await resumen();

    // Comprobante primero: una factura solo se marca pagada CON respaldo
    // (§7 — "la factura nace pagada"), así que el test pasa por ese aro igual
    // que el dueño. PNG mínimo válido: el backend detecta el tipo por los
    // bytes, no por el nombre del archivo (§4.6).
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
        '0000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
      'hex',
    );
    const proof = await request
      .post('/invoices/upload-payment-proof')
      .set(auth())
      .attach('proof', png, 'comprobante.png')
      .expect(201);

    await request
      .post('/invoices/manual')
      .set(auth())
      .send({
        supplierNit: '900999888',
        supplierName: 'Proveedor Tesoro',
        invoiceNumber: 'TES-1',
        total: 80_000,
        items: [
          {
            entityType: 'PRODUCT',
            productId,
            descriptionRaw: 'Gaseosa x20',
            quantity: 20,
            unit: 'unidad',
            unitPrice: 4_000,
            total: 80_000,
          },
        ],
        // Pago mixto: $30.000 del cajón y $50.000 de la cuenta.
        payment: {
          proofStorageKey: proof.body.proofStorageKey,
          cashAmount: 30_000,
          bankAmount: 50_000,
        },
      })
      .expect(201);

    const despues = await resumen();
    expect(despues.cash.expensesPaid - antes.cash.expensesPaid).toBeCloseTo(30_000, 2);
    expect(despues.bank.expensesPaid - antes.bank.expensesPaid).toBeCloseTo(50_000, 2);
    // Comprar mercancía saca plata del bolsillo aunque todavía no sea un gasto
    // del P&G: es inventario hasta que se consume.
    expect(despues.total).toBeCloseTo(antes.total - 80_000, 2);
    cuadra(despues.cash);
    cuadra(despues.bank);
  });

  it('un ajuste manual corrige el bolsillo y queda declarado como ajuste', async () => {
    const antes = await resumen();
    await request
      .post('/treasury/adjustment')
      .set(auth())
      .send({ pocket: 'EFECTIVO', amount: -15_000, reason: 'Faltante encontrado al contar' })
      .expect(201);
    const despues = await resumen();

    expect(despues.cash.adjustments - antes.cash.adjustments).toBeCloseTo(-15_000, 2);
    expect(despues.total).toBeCloseTo(antes.total - 15_000, 2);
    cuadra(despues.cash);
  });

  it('anular un movimiento de tesorería lo saca del saldo', async () => {
    const antes = await resumen();
    const mov = await request
      .post('/treasury/adjustment')
      .set(auth())
      .send({ pocket: 'CUENTA', amount: 40_000, reason: 'Ajuste que se va a anular' })
      .expect(201);
    const conAjuste = await resumen();
    expect(conAjuste.total).toBeCloseTo(antes.total + 40_000, 2);

    await request
      .post(`/treasury/movements/${mov.body.id}/void`)
      .set(auth())
      .send({ reason: 'Me equivoqué de bolsillo' })
      .expect(201);

    const despues = await resumen();
    expect(despues.total).toBeCloseTo(antes.total, 2);
    cuadra(despues.bank);
  });

  it('LEY: el saldo de cada bolsillo es la suma de SUS movimientos, y el total es la de los dos', async () => {
    // La costura completa. Después de ventas, cuentas divididas, un domicilio,
    // un traspaso, una factura pagada mixta, un ajuste y una anulación, cada
    // bolsillo tiene que reconstruirse desde sus propias partes.
    const r = await resumen();
    cuadra(r.cash);
    cuadra(r.bank);
    expect(r.total).toBeCloseTo(r.cash.balance + r.bank.balance, 2);
    // Y lo proyectado es el total menos lo que se debe.
    expect(r.projected).toBeCloseTo(r.total - r.commitmentsTotal, 2);
  });

  it('un compromiso pendiente NO baja el saldo, pero sí lo proyectado', async () => {
    // La diferencia entre "tengo" y "me queda después de pagar lo que debo".
    const antes = await resumen();
    await request
      .post('/payables')
      .set(auth())
      .send({
        beneficiary: 'Técnico del horno',
        description: 'Arreglo del horno',
        amount: 200_000,
        isExpense: true,
      })
      .expect(201);
    const despues = await resumen();

    expect(despues.total).toBeCloseTo(antes.total, 2);
    expect(despues.commitmentsTotal - antes.commitmentsTotal).toBeCloseTo(200_000, 2);
    expect(despues.projected).toBeCloseTo(antes.projected - 200_000, 2);
  });
});
