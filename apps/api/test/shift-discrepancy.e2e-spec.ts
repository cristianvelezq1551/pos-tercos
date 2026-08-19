/**
 * shift-discrepancy.e2e-spec.ts — el descuadre se mide sobre TODA la plata.
 *
 * Antes, cajón y cuenta se evaluaban por separado contra el umbral: un turno
 * con +$3.000 en el cajón y +$3.000 en transferencias cerraba sin novedad,
 * aunque faltaran $6.000 en total.
 */

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Descuadre combinado E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;
  let shiftId: string;
  let productId: string;

  const PRICE = 10_000;
  const OPENING = 50_000;
  const SESGO = 3_000; // por pata: bajo el umbral de $5.000

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-desc@test.local',
          fullName: 'Dueño Descuadre',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cajero-desc@test.local',
          fullName: 'Cajero Descuadre',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-desc@test.local');
    cajeroToken = await loginAs(request, 'cajero-desc@test.local');

    const product = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Gaseosa Descuadre',
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
    productId = product.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        entityType: 'PRODUCT',
        productId,
        delta: 20,
        type: 'INITIAL',
        notes: 'stock test',
      })
      .expect(201);

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

  const sell = async (method: 'CASH' | 'TRANSFER') => {
    const created = await request
      .post('/sales')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items: [{ productId, quantity: 1 }] })
      .expect(201);
    await request
      .post(`/sales/${created.body.id}/confirm-payment`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        method,
        amountReceived: PRICE,
        ...(method === 'TRANSFER' ? { digitalDoubleVerified: true } : {}),
      })
      .expect(201);
  };

  it('dos sobrantes chicos (cajón + cuenta) suman una novedad', async () => {
    await sell('CASH');
    await sell('TRANSFER');

    const closed = await request
      .post(`/shifts/${shiftId}/close`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({
        countedCash: OPENING + PRICE + SESGO,
        digitalCounts: [{ method: 'TRANSFER', counted: PRICE + SESGO }],
      })
      .expect(201);
    expect(closed.body.difference).toBe(SESGO);

    const novedades = await prisma.auditLog.findMany({
      where: { action: 'SHIFT_DISCREPANCY_DETECTED', entityId: shiftId },
    });
    // Ni el cajón ni la cuenta llegan solos al umbral: la única novedad es la
    // combinada, con las dos patas y el total a la vista.
    expect(novedades).toHaveLength(1);
    const metadata = novedades[0].metadata as {
      kind: string;
      cashDifference: number;
      digitalDifference: number;
      total: number;
    };
    expect(metadata.kind).toBe('combined');
    expect(metadata.cashDifference).toBe(SESGO);
    expect(metadata.digitalDifference).toBe(SESGO);
    expect(metadata.total).toBe(2 * SESGO);
  });
});
