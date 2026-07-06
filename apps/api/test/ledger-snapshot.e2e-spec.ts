/**
 * ledger-snapshot.e2e-spec.ts — Arquitectura de snapshot del ledger FIFO (B1
 * del informe de calidad): el replay de COGS arranca del snapshot mensual en
 * vez del génesis. Valida las 3 reglas de corrección de CogsService:
 *   1. Incremental === replay completo para valuación y ventas post-corte.
 *   2. Rango que empieza antes del corte → replay completo (P&G histórico
 *      conserva mermas y costos por venta pre-corte).
 *   3. Reversa que cruza el corte (void de venta del mes pasado) → fallback
 *      automático a replay completo (needsFullReplay), nunca dato incorrecto.
 *
 * Los movimientos "del mes pasado" se insertan crudos con createdAt explícito
 * (la tabla es insert-only: no se puede backdatear vía UPDATE, pero el INSERT
 * con timestamp explícito es legítimo — así llegan también en una migración
 * de datos).
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Ledger snapshot FIFO E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let cogs: CogsService;

  let duenoToken: string;
  let cajeroToken: string;
  let ingId: string;
  let gaseosaId: string;

  // "Mes pasado" relativo a hoy (el corte del snapshot es el 1° del mes actual).
  const now = new Date();
  const lastMonth = (day: number): Date =>
    new Date(now.getFullYear(), now.getMonth() - 1, day, 10, 0, 0);
  const cutoff = new Date(now.getFullYear(), now.getMonth(), 1);

  const oldSaleId = randomUUID(); // venta "del mes pasado" (movimientos crudos)

  const getValuation = async () => {
    cogs.invalidateLedgerCache();
    const res = await request
      .get('/reports/cogs/inventory-valuation')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const body = res.body as {
      asOf?: string;
      items: { entityType: string; id: string; qty: number; value: number }[];
      totalValue: number;
    };
    // Normalizar para comparación: asOf es un timestamp y el orden entre
    // items con el MISMO value depende del origen del replay.
    delete body.asOf;
    body.items.sort((a, b) => a.id.localeCompare(b.id));
    return body;
  };

  const iso = (d: Date): string => d.toISOString().slice(0, 10);

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    cogs = app.get(CogsService);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-ledger@test.local', fullName: 'Dueño Ledger', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-ledger@test.local', fullName: 'Cajero Ledger', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-ledger@test.local');
    cajeroToken = await loginAs(request, 'cajero-ledger@test.local');

    const ing = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ name: 'Queso Ledger', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0 })
      .expect(201);
    ingId = ing.body.id as string;

    const gaseosa = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Gaseosa Ledger',
        category: 'Bebidas',
        basePrice: 5_000,
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

    // ── Historia del MES PASADO (pre-corte), insertada cruda ──
    // Compra: 20 gaseosas a $1.000 + 10.000 g de queso a $2/g.
    // Merma: 2.000 g de queso ($4.000).
    // Venta vieja: 4 gaseosas (consumo FIFO $4.000) — luego se anula HOY.
    await prisma.inventoryMovement.create({
      data: { entityType: 'PRODUCT', productId: gaseosaId, delta: 20, type: 'PURCHASE', unitCost: 1_000, createdAt: lastMonth(3) },
    });
    await prisma.inventoryMovement.create({
      data: { entityType: 'INGREDIENT', ingredientId: ingId, delta: 10_000, type: 'PURCHASE', unitCost: 2, createdAt: lastMonth(3) },
    });
    await prisma.inventoryMovement.create({
      data: { entityType: 'INGREDIENT', ingredientId: ingId, delta: -2_000, type: 'WASTE', notes: 'merma test', createdAt: lastMonth(10) },
    });
    await prisma.inventoryMovement.create({
      data: { entityType: 'PRODUCT', productId: gaseosaId, delta: -4, type: 'SALE', sourceType: 'sale', sourceId: oldSaleId, createdAt: lastMonth(15) },
    });
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('el snapshot se crea con el corte del mes actual y resume lo pre-corte', async () => {
    // Baseline con replay completo (sin snapshot todavía).
    const before = await getValuation();

    const res = await request
      .post('/reports/admin/ledger-snapshot')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(201);
    expect(res.body.cutoffAt).toBe(cutoff.toISOString());
    expect(res.body.movementsCount).toBe(4);
    expect(res.body.lotsCount).toBe(2); // gaseosa + queso con lotes restantes

    // Regla 1: la valuación por la ruta INCREMENTAL es idéntica al replay full.
    const after = await getValuation();
    expect(after).toEqual(before);
    // Y los números son los esperados: 16 gaseosas ×$1.000 + 8.000 g ×$2.
    expect(after.totalValue).toBe(16_000 + 16_000);
  });

  it('una venta de HOY se costea con los lotes sembrados del snapshot', async () => {
    // COUNTER exige caja abierta desde la creación de la venta.
    await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: 0 })
      .expect(201);
    const created = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId: gaseosaId, quantity: 3 }] })
      .expect(201);
    await request
      .post(`/sales/${created.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ method: 'CASH', amountReceived: 15_000 })
      .expect(201);

    // P&G del mes ACTUAL (rango >= corte → ruta incremental): el costo de la
    // venta sale del lote de $1.000 comprado el mes pasado (viene en el seed).
    cogs.invalidateLedgerCache();
    const pnl = await request
      .get(`/reports/cogs/pnl?from=${iso(cutoff)}&to=${iso(now)}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(pnl.body.revenue).toBe(15_000);
    expect(pnl.body.cogs).toBe(3_000);
    // La merma fue el mes pasado → NO entra en el P&G de este mes.
    expect(pnl.body.wasteCost).toBe(0);
  });

  it('regla 2: P&G con rango que empieza antes del corte usa replay completo', async () => {
    cogs.invalidateLedgerCache();
    const pnl = await request
      .get(`/reports/cogs/pnl?from=${iso(lastMonth(1))}&to=${iso(now)}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    // La merma del mes pasado SÍ aparece (2.000 g × $2).
    expect(pnl.body.wasteCost).toBe(4_000);
    // Y el COGS de la venta de hoy sigue exacto.
    expect(pnl.body.cogs).toBe(3_000);
  });

  it('regla 3: anular HOY la venta del mes pasado → fallback a replay completo', async () => {
    // Reverso crudo (como lo emite el void): SALE +4, mismo sourceId, HOY.
    await prisma.inventoryMovement.create({
      data: { entityType: 'PRODUCT', productId: gaseosaId, delta: 4, type: 'SALE', sourceType: 'sale', sourceId: oldSaleId },
    });

    // La ruta incremental no tiene los draws pre-corte → needsFullReplay →
    // el servicio recomputa completo. Las 4 gaseosas vuelven a su costo
    // ORIGINAL ($1.000), no como lote desconocido.
    const val = await getValuation();
    const gaseosa = val.items.find((i) => i.id === gaseosaId);
    // 20 − 4 (venta vieja) − 3 (venta de hoy) + 4 (reverso) = 17 × $1.000.
    expect(gaseosa?.qty).toBe(17);
    expect(gaseosa?.value).toBe(17_000);
  });
});
