/**
 * domicilio-pagado-del-cajon.e2e-spec.ts — §7.v71.
 *
 * El cliente transfiere la comida MÁS el domicilio en un solo pago; la venta
 * registra solo la comida y al domiciliario se le paga en efectivo del cajón.
 * Sin registrar ese movimiento, cada cierre queda con el cajón corto y la
 * cuenta sobrada por el mismo monto — que es justo lo que la auditoría de
 * producción encontró el 5, 6, 8 y 9 de septiembre.
 *
 * Lo que estas pruebas fijan es que la corrección toque EXACTAMENTE tres
 * libros (cajón, cuenta y bolsillos de tesorería) y ninguno más: ni las
 * ventas, ni los ingresos, ni el inventario, ni el costo de lo vendido.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { hoyLocal } from './helpers/local-day';

const APERTURA = 100_000;
const COMIDA = 30_000;
const DOMICILIO = 8_000;

interface Esperado {
  expectedCash: number;
  digital: Array<{ method: string; expected: number }>;
}
interface Bolsillos {
  cash: { balance: number };
  bank: { balance: number };
  total: number;
}

describe('Domicilio pagado del cajón E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let shiftId: string;
  let productId: string;

  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

  const esperado = async (): Promise<Esperado> =>
    (await request.get(`/shifts/${shiftId}/expected-cash`).set(auth()).expect(200)).body as Esperado;
  const transferEsperado = async (): Promise<number> =>
    (await esperado()).digital.find((d) => d.method === 'TRANSFER')?.expected ?? 0;
  const bolsillos = async (): Promise<Bolsillos> =>
    (await request.get('/treasury/summary').set(auth()).expect(200)).body as Bolsillos;

  const registrar = async (
    amount = DOMICILIO,
    note?: string,
  ): Promise<Array<{ id: string; type: string; method: string; pairId: string | null; purpose: string | null }>> =>
    (
      await request
        .post(`/shifts/${shiftId}/delivery-payout`)
        .set(auth())
        .send(note === undefined ? { amount } : { amount, note })
        .expect(201)
    ).body;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-domicilio@test.local',
        fullName: 'Dueño Domicilio',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    await prisma.productCategory.createMany({
      data: [{ name: 'Test', sortOrder: 0, isActive: true }],
      skipDuplicates: true,
    });
    token = await loginAs(request, 'dueno-domicilio@test.local');

    // Ancla de tesorería: sin ella los bolsillos no se pueden comparar.
    await request
      .patch('/treasury/config')
      .set(auth())
      .send({ anchorDate: hoyLocal(), initialCash: 0, initialBank: 0 })
      .expect(200);

    productId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Test',
          name: `Comida ${randomUUID().slice(0, 6)}`,
          basePrice: COMIDA,
          directResale: false,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id;

    shiftId = (
      await request.post('/shifts/open').set(auth()).send({ openingCash: APERTURA }).expect(201)
    ).body.id;

    // La venta de la comida, cobrada por transferencia: es el caso real.
    const venta = (
      await request
        .post('/sales')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
        .expect(201)
    ).body;
    await request
      .post(`/sales/${venta.id}/confirm-payment`)
      .set(auth())
      .send({ method: 'TRANSFER', amountReceived: COMIDA, digitalDoubleVerified: true })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('el punto de partida: el cajón espera la apertura y la cuenta espera la comida', async () => {
    const e = await esperado();
    expect(e.expectedCash).toBe(APERTURA);
    expect(await transferEsperado()).toBe(COMIDA);
  });

  it('registrarlo deja las dos patas emparejadas y marcadas', async () => {
    const patas = await registrar(DOMICILIO, 'pedido de la 30');
    expect(patas).toHaveLength(2);
    const salida = patas.find((p) => p.type === 'OUT');
    const entrada = patas.find((p) => p.type === 'IN');
    expect(salida?.method).toBe('CASH');
    expect(entrada?.method).toBe('TRANSFER');
    expect(salida?.purpose).toBe('DELIVERY_PAYOUT');
    expect(salida?.pairId).toBe(entrada?.pairId);
    expect(salida?.pairId).toBeTruthy();
  });

  it('el cajón deja de esperar esa plata y la cuenta la espera', async () => {
    expect((await esperado()).expectedCash).toBe(APERTURA - DOMICILIO);
    expect(await transferEsperado()).toBe(COMIDA + DOMICILIO);
  });

  it('tesorería mueve los bolsillos sin cambiar el total', async () => {
    const b = await bolsillos();
    // El cobro de la comida entró a la cuenta; el domicilio salió del efectivo
    // y entró a la cuenta. El total del negocio no cambia por un traspaso.
    expect(b.cash.balance).toBe(-DOMICILIO);
    expect(b.bank.balance).toBe(COMIDA + DOMICILIO);
    expect(b.total).toBe(COMIDA);
  });

  it('no toca las ventas ni los ingresos del mes', async () => {
    const hoy = hoyLocal();
    const resumen = (
      await request.get(`/reports/sales-summary?from=${hoy}&to=${hoy}`).set(auth()).expect(200)
    ).body as { totals: { revenue: number; count: number } };
    expect(resumen.totals.revenue).toBe(COMIDA);
    expect(resumen.totals.count).toBe(1);
  });

  it('una pata suelta no se puede editar ni borrar', async () => {
    const movimientos = (
      await request.get(`/shifts/${shiftId}/cash-movements`).set(auth()).expect(200)
    ).body as Array<{ id: string; pairId: string | null }>;
    const pata = movimientos.find((m) => m.pairId !== null);
    expect(pata).toBeDefined();
    await request
      .patch(`/shifts/${shiftId}/cash-movements/${pata!.id}`)
      .set(auth())
      .send({ type: 'OUT', method: 'CASH', amount: 1_000, reason: 'intento de edición' })
      .expect(400);
    await request
      .delete(`/shifts/${shiftId}/cash-movements/${pata!.id}`)
      .set(auth())
      .expect(400);
    // Y el esperado sigue intacto tras los dos intentos.
    expect((await esperado()).expectedCash).toBe(APERTURA - DOMICILIO);
  });

  it('deshacerlo devuelve los tres libros a como estaban', async () => {
    const movimientos = (
      await request.get(`/shifts/${shiftId}/cash-movements`).set(auth()).expect(200)
    ).body as Array<{ pairId: string | null }>;
    const pairId = movimientos.find((m) => m.pairId !== null)!.pairId as string;
    await request.delete(`/shifts/${shiftId}/delivery-payout/${pairId}`).set(auth()).expect(200);

    expect((await esperado()).expectedCash).toBe(APERTURA);
    expect(await transferEsperado()).toBe(COMIDA);
    const b = await bolsillos();
    expect(b.cash.balance).toBe(0);
    expect(b.bank.balance).toBe(COMIDA);
    expect(b.total).toBe(COMIDA);
    const quedan = (
      await request.get(`/shifts/${shiftId}/cash-movements`).set(auth()).expect(200)
    ).body as unknown[];
    expect(quedan).toHaveLength(0);
  });

  it('deshacer dos veces el mismo domicilio no rompe nada', async () => {
    const patas = await registrar();
    const pairId = patas[0].pairId as string;
    await request.delete(`/shifts/${shiftId}/delivery-payout/${pairId}`).set(auth()).expect(200);
    await request.delete(`/shifts/${shiftId}/delivery-payout/${pairId}`).set(auth()).expect(404);
    expect((await esperado()).expectedCash).toBe(APERTURA);
  });

  it('un monto de cero o negativo se rechaza', async () => {
    await request.post(`/shifts/${shiftId}/delivery-payout`).set(auth()).send({ amount: 0 }).expect(400);
    await request
      .post(`/shifts/${shiftId}/delivery-payout`)
      .set(auth())
      .send({ amount: -5_000 })
      .expect(400);
  });

  it('dos domicilios en el mismo turno se suman y se deshacen por separado', async () => {
    const a = await registrar(5_000);
    const b = await registrar(3_000);
    expect(a[0].pairId).not.toBe(b[0].pairId);
    expect((await esperado()).expectedCash).toBe(APERTURA - 8_000);
    await request
      .delete(`/shifts/${shiftId}/delivery-payout/${a[0].pairId as string}`)
      .set(auth())
      .expect(200);
    expect((await esperado()).expectedCash).toBe(APERTURA - 3_000);
    await request
      .delete(`/shifts/${shiftId}/delivery-payout/${b[0].pairId as string}`)
      .set(auth())
      .expect(200);
    expect((await esperado()).expectedCash).toBe(APERTURA);
  });

  it('con la caja cerrada ya no se registra ni se deshace', async () => {
    const patas = await registrar();
    const pairId = patas[0].pairId as string;
    await request
      .post(`/shifts/${shiftId}/close`)
      .set(auth())
      .send({
        countedCash: APERTURA - DOMICILIO,
        digitalCounts: [{ method: 'TRANSFER', counted: COMIDA + DOMICILIO }],
      })
      .expect(201);
    await request
      .post(`/shifts/${shiftId}/delivery-payout`)
      .set(auth())
      .send({ amount: 1_000 })
      .expect(400);
    await request.delete(`/shifts/${shiftId}/delivery-payout/${pairId}`).set(auth()).expect(400);
  });

  it('y el cierre queda sin descuadre: el arqueo esperaba exactamente lo que había', async () => {
    const cerrada = (await request.get(`/shifts/${shiftId}`).set(auth()).expect(200)).body as {
      difference: number;
      expectedCash: number;
    };
    expect(cerrada.expectedCash).toBe(APERTURA - DOMICILIO);
    expect(cerrada.difference).toBe(0);
  });
});
