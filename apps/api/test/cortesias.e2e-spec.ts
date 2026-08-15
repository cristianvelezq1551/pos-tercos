/**
 * cortesias.e2e-spec.ts
 *
 * Cortesías (producto regalado) — flujo 2026-07 SIN aprobación: el cajero la
 * REGISTRA y se aplica al instante (status APPROVED, descuenta stock a costo
 * FIFO en la misma tx). El admin puede ANULARLA (reverse → REVERSED): devuelve
 * el stock con un movimiento compensatorio y la saca del COGS de cortesías.
 * Cubre la máquina de estados, el efecto sobre el inventario y los guards.
 */

import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Cortesías E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let productId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createCortesia = async (quantity: number, reason: string) => {
    const res = await request
      .post('/cortesias')
      .set(auth(cajeroToken))
      .send({ productId, quantity, reason })
      .expect(201);
    return res.body as { id: string; status: string };
  };

  const consumeMovements = (cortesiaId: string) =>
    prisma.inventoryMovement.findMany({ where: { sourceType: 'cortesia', sourceId: cortesiaId } });
  const reversalMovements = (cortesiaId: string) =>
    prisma.inventoryMovement.findMany({ where: { sourceType: 'cortesia_reversal', sourceId: cortesiaId } });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-cortesias@test.local', fullName: 'Dueño Cortesías', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-cortesias@test.local', fullName: 'Cajero Cortesías', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-cortesias@test.local');
    cajeroToken = await loginAs(request, 'cajero-cortesias@test.local');

    // Producto de reventa directa: una cortesía consume el producto mismo.
    const prod = await request
      .post('/products')
      .set(auth(duenoToken))
      .send({
        name: 'Gaseosa Cortesía Test',
        category: 'Bebidas',
        basePrice: 4_000,
        isActive: true,
        directResale: true,
        isCombo: false,
        modifiersEnabled: false,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor: 24,
        thresholdMin: 0,
      })
      .expect(201);
    productId = prod.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('registrar deja la cortesía APPROVED y descuenta stock al instante', async () => {
    const { id, status } = await createCortesia(2, 'Cliente frecuente');
    expect(status).toBe('APPROVED');

    const movements = await consumeMovements(id);
    expect(movements).toHaveLength(1);
    expect(movements[0]!.productId).toBe(productId);
    expect(Number(movements[0]!.delta)).toBe(-2); // 2 unidades consumidas ya
  });

  it('el mismo Idempotency-Key no crea una segunda cortesía (retry seguro)', async () => {
    const key = randomUUID();
    const body = { productId, quantity: 2, reason: 'Doble-click / retry' };

    const first = await request
      .post('/cortesias')
      .set(auth(cajeroToken))
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const second = await request
      .post('/cortesias')
      .set(auth(cajeroToken))
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    // El retry devuelve la MISMA cortesía, no una nueva.
    expect(second.body.id).toBe(first.body.id);
    // Y el stock se descontó UNA sola vez (no dos movimientos por el doble envío).
    const movements = await consumeMovements(first.body.id as string);
    expect(movements).toHaveLength(1);
    expect(Number(movements[0]!.delta)).toBe(-2);
    // No quedó una segunda fila colgada para ese producto.
    const total = await prisma.cortesiaRequest.count({
      where: { productId, reason: 'Doble-click / retry' },
    });
    expect(total).toBe(1);
  });

  it('el historial del día trae TODAS las cortesías, no solo las propias', async () => {
    const { id } = await createCortesia(1, 'Para el historial');
    // Una registrada por OTRO usuario (el dueño): el historial de la caja no
    // filtra por cajero — un pedido regalado es del día, no de quien lo dio.
    const otra = await request
      .post('/cortesias')
      .set(auth(duenoToken))
      .send({ productId, quantity: 1, reason: 'Regalada por el dueño' })
      .expect(201);

    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await request
      .get(`/cortesias/day?from=${encodeURIComponent(from)}`)
      .set(auth(cajeroToken))
      .expect(200);
    const ids = (res.body as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(id);
    expect(ids).toContain(otra.body.id as string);

    // Fuera de la ventana no aparece nada (el historial es del día, no de siempre).
    const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const vacio = await request
      .get(`/cortesias/day?from=${encodeURIComponent(futuro)}`)
      .set(auth(cajeroToken))
      .expect(200);
    expect(vacio.body).toHaveLength(0);
  });

  it('un `from` inválido es 400 del cliente, no un 500 de Prisma', async () => {
    await request.get('/cortesias/day?from=ayer').set(auth(cajeroToken)).expect(400);
  });

  it('un rol no-admin no puede anular (403)', async () => {
    const { id } = await createCortesia(1, 'Prueba de rol');
    await request.post(`/cortesias/${id}/reverse`).set(auth(cajeroToken)).send({}).expect(403);
  });

  it('anular (reverse) devuelve el stock y marca REVERSED', async () => {
    const { id } = await createCortesia(3, 'Regalo por error');
    const res = await request.post(`/cortesias/${id}/reverse`).set(auth(duenoToken)).send({}).expect(201);
    expect(res.body.status).toBe('REVERSED');

    const consume = await consumeMovements(id);
    const reversal = await reversalMovements(id);
    expect(consume).toHaveLength(1);
    expect(Number(consume[0]!.delta)).toBe(-3);
    expect(reversal).toHaveLength(1);
    expect(Number(reversal[0]!.delta)).toBe(3); // devuelve exactamente lo descontado
  });

  it('no se puede anular dos veces (guard TOCTOU)', async () => {
    const { id } = await createCortesia(1, 'Doble anulación');
    await request.post(`/cortesias/${id}/reverse`).set(auth(duenoToken)).send({}).expect(201);
    await request.post(`/cortesias/${id}/reverse`).set(auth(duenoToken)).send({}).expect(400);
    expect(await reversalMovements(id)).toHaveLength(1); // solo una devolución
  });

  it('la DB rechaza un status fuera del enum (garantía nativa, no solo la app)', async () => {
    const { id } = await createCortesia(1, 'Estado inválido');
    await expect(
      prisma.$executeRawUnsafe(`UPDATE cortesia_requests SET status = 'INVALIDO' WHERE id = '${id}'`),
    ).rejects.toThrow();
  });

  it('el resumen del mes cuenta las cortesías registradas y excluye las anuladas', async () => {
    await cleanDb(prisma);
    // Re-seed mínimo (cleanDb borró usuarios/producto).
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-cortesias@test.local', fullName: 'Dueño Cortesías', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-cortesias@test.local', fullName: 'Cajero Cortesías', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-cortesias@test.local');
    cajeroToken = await loginAs(request, 'cajero-cortesias@test.local');
    const prod = await request
      .post('/products')
      .set(auth(duenoToken))
      .send({
        name: 'Gaseosa Cortesía Test 2', category: 'Bebidas', basePrice: 4_000, isActive: true,
        directResale: true, isCombo: false, modifiersEnabled: false, unitPurchase: 'caja',
        unitStock: 'unidad', conversionFactor: 24, thresholdMin: 0,
      })
      .expect(201);
    productId = prod.body.id as string;

    await createCortesia(1, 'Cuenta 1');
    await createCortesia(1, 'Cuenta 2');
    const { id: toReverse } = await createCortesia(1, 'Se anula');
    await request.post(`/cortesias/${toReverse}/reverse`).set(auth(duenoToken)).send({}).expect(201);

    const now = new Date();
    const res = await request
      .get(`/cortesias/given-summary?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .set(auth(duenoToken))
      .expect(200);
    // 3 registradas − 1 anulada = 2 cuentan.
    expect(res.body.count).toBe(2);
  });
});
