/**
 * shifts-offline-open.e2e-spec.ts — Apertura de caja OFFLINE (B.4b, decisión
 * 2026-07-06: se REVIERTE el diferimiento de offline-fase-b.md). El POS abre
 * la caja sin internet y la sincroniza al volver la red — ANTES que las
 * ventas offline, para que tengan caja a la cual colgarse.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Apertura de caja offline E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let cajeroToken: string;
  let duenoToken: string;
  let gaseosaId: string;

  const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000).toISOString();

  const syncOpen = (body: Record<string, unknown>) =>
    request
      .post('/shifts/sync-offline-open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send(body);

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'cajero-offopen@test.local', fullName: 'Cajero OffOpen', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'dueno-offopen@test.local', fullName: 'Dueño OffOpen', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
      skipDuplicates: true,
    });
    cajeroToken = await loginAs(request, 'cajero-offopen@test.local');
    duenoToken = await loginAs(request, 'dueno-offopen@test.local');

    const gaseosa = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Gaseosa OffOpen',
        category: 'Bebidas',
        basePrice: 4_000,
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
      .send({ entityType: 'PRODUCT', productId: gaseosaId, delta: 50, type: 'INITIAL', notes: 'stock test' })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  afterEach(async () => {
    // Caja única: cada test arranca sin cajas. TRUNCATE (no deleteMany):
    // los row-triggers (insert-only, Σ pagos == total) bloquean el DELETE.
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE cash_movements, sale_payments, sale_status_log, sale_items, sales, shifts CASCADE',
    );
  });

  it('crea la caja backdateada, es idempotente y las ventas offline se cuelgan de ella', async () => {
    const localId = randomUUID();
    const openedOfflineAt = minutesAgo(45);

    const first = await syncOpen({ localId, openingCash: 30_000, openedOfflineAt }).expect(201);
    expect(first.body.adopted).toBe(false);
    expect(first.body.shift.status).toBe('OPEN');
    expect(first.body.shift.openingCash).toBe(30_000);
    // openedAt backdateado al momento real de la apertura.
    expect(new Date(first.body.shift.openedAt).toISOString()).toBe(openedOfflineAt);

    // Reintento con el mismo localId → la MISMA caja, sin duplicar.
    const retry = await syncOpen({ localId, openingCash: 30_000, openedOfflineAt }).expect(201);
    expect(retry.body.shift.id).toBe(first.body.shift.id);
    expect(await prisma.shift.count()).toBe(1);

    // Una venta offline sincronizada después se cuelga de esta caja.
    const sale = await request
      .post('/sales/sync-offline')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        localId: randomUUID(),
        provisionalNumber: 'OFF-1',
        soldOfflineAt: minutesAgo(30),
        payment: { method: 'CASH', amountReceived: 4_000, offlineVerified: true },
        payload: {
          type: 'COUNTER',
          customerName: null,
          subtotal: 4_000,
          discount: 0,
          total: 4_000,
          lines: [
            {
              productId: gaseosaId,
              sizeId: null,
              quantity: 1,
              unitPrice: 4_000,
              modifiers: [],
              notes: null,
              lineSubtotal: 4_000,
              lineDiscount: 0,
              lineTotal: 4_000,
              appliedPromotionId: null,
            },
          ],
        },
      })
      .expect(201);
    expect(sale.body.shiftId).toBe(first.body.shift.id);
  });

  it('adopta la caja ya abierta hoy (caja única) y audita el fondo distinto', async () => {
    const online = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ openingCash: 50_000 })
      .expect(201);

    const res = await syncOpen({
      localId: randomUUID(),
      openingCash: 20_000, // fondo distinto al de la caja online
      openedOfflineAt: minutesAgo(10),
    }).expect(201);
    expect(res.body.adopted).toBe(true);
    expect(res.body.shift.id).toBe(online.body.id);
    // No pisa el fondo original (la primera apertura gana).
    expect(res.body.shift.openingCash).toBe(50_000);
    expect(await prisma.shift.count()).toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SHIFT_OPENED', entityId: online.body.id },
      orderBy: { createdAt: 'desc' },
    });
    const meta = audit?.metadata as { adopted?: boolean; openingCashMismatch?: unknown };
    expect(meta.adopted).toBe(true);
    expect(meta.openingCashMismatch).toEqual({ offline: 20_000, existing: 50_000 });
  });

  it('rechaza reloj adelantado (>15 min en el futuro)', async () => {
    await syncOpen({
      localId: randomUUID(),
      openingCash: 10_000,
      openedOfflineAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    }).expect(400);
    expect(await prisma.shift.count()).toBe(0);
  });

  it('caja OPEN de un día anterior → 409 (hay que cerrarla primero)', async () => {
    const stale = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ openingCash: 10_000 })
      .expect(201);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await prisma.shift.update({ where: { id: stale.body.id }, data: { openedAt: yesterday } });

    await syncOpen({
      localId: randomUUID(),
      openingCash: 25_000,
      openedOfflineAt: minutesAgo(5),
    }).expect(409);
  });

  it('la caja del día ya cerrada → 409 (no se crea una segunda)', async () => {
    const shift = await request
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ openingCash: 10_000 })
      .expect(201);
    await request
      .post(`/shifts/${shift.body.id}/close`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ countedCash: 10_000 })
      .expect(201);

    await syncOpen({
      localId: randomUUID(),
      openingCash: 25_000,
      openedOfflineAt: minutesAgo(5),
    }).expect(409);
  });
});
