/**
 * waste-reversal.e2e-spec.ts
 *
 * Anulación de merma. `inventory_movements` es insert-only, así que una merma
 * mal registrada (el clásico "10 kg" en vez de "1 kg") solo se corregía con un
 * ajuste manual: devolvía la CANTIDAD, pero el costo seguía restando del neto
 * del P&G para siempre, sin camino de corrección.
 *
 * Estos tests verifican que la reversa devuelve las unidades con su base de
 * costo REAL y que el estado financiero refleja la pérdida verdadera.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Anulación de merma E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let ingredientId: string;
  let cogs: CogsService;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Costo de merma que el P&G resta del neto, en la ventana de hoy. */
  const wasteCostToday = async (): Promise<number> => {
    // El ledger se cachea 60s a propósito (un reporte de COGS tolera ese
    // staleness). Acá medimos la LÓGICA, no la caché.
    cogs.invalidateLedgerCache();
    const today = new Date().toISOString().slice(0, 10);
    const res = await request
      .get(`/reports/cogs/pnl?from=${today}&to=${today}`)
      .set(auth(duenoToken))
      .expect(200);
    return (res.body as { wasteCost: number }).wasteCost;
  };

  const stockOf = async (): Promise<number> => {
    const res = await request
      .get(`/inventory/stock/ingredient/${ingredientId}`)
      .set(auth(duenoToken))
      .expect(200);
    return (res.body as { currentStock: number }).currentStock;
  };

  /** Registra una merma y devuelve el id del movimiento. */
  const registerWaste = async (qty: number): Promise<string> => {
    const res = await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId,
        delta: -qty,
        type: 'WASTE',
        notes: 'Merma de prueba',
      })
      .expect(201);
    return (res.body as { id: string }).id;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    cogs = app.get(CogsService);
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-merma@test.local',
        fullName: 'Dueño Merma',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-merma@test.local');

    const ing = await request
      .post('/ingredients')
      .set(auth(duenoToken))
      .send({
        name: 'Carne Merma Test',
        unitPurchase: 'kg',
        unitRecipe: 'g',
        conversionFactor: 1000,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    ingredientId = (ing.body as { id: string }).id;

    // Stock inicial valorizado: 10.000 g a $20/g = $200.000.
    await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId,
        delta: 10_000,
        type: 'INITIAL',
        unitCost: 20,
        notes: 'Carga inicial',
      })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('anular la merma entera devuelve el stock y borra la pérdida del P&G', async () => {
    const stockAntes = await stockOf();
    const wasteId = await registerWaste(1_000); // 1.000 g × $20 = $20.000

    expect(await wasteCostToday()).toBe(20_000);
    expect(await stockOf()).toBe(stockAntes - 1_000);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Se registró por error, no se tiró nada' })
      .expect(201);

    // La pérdida desaparece del estado financiero y el stock vuelve entero.
    expect(await wasteCostToday()).toBe(0);
    expect(await stockOf()).toBe(stockAntes);
  });

  it('anular PARCIALMENTE deja en el P&G solo lo que de verdad se tiró', async () => {
    const stockAntes = await stockOf();
    // El cocinero teclea 10.000 g cuando en realidad tiró 1.000.
    const wasteId = await registerWaste(10_000);
    expect(await wasteCostToday()).toBe(200_000);

    // El dueño devuelve los 9.000 g que nunca se tiraron.
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Dedo pesado: fue 1 kg, no 10', quantity: 9_000 })
      .expect(201);

    // Pérdida real: 1.000 g × $20 = $20.000 (no $200.000).
    expect(await wasteCostToday()).toBe(20_000);
    expect(await stockOf()).toBe(stockAntes - 1_000);
  });

  it('las reversas parciales se acumulan y nunca devuelven más de lo mermado', async () => {
    const wasteId = await registerWaste(500);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Primera devolución parcial', quantity: 300 })
      .expect(201);

    // Quedan 200 sin anular: pedir 300 más debe fallar.
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Se pasa de lo mermado', quantity: 300 })
      .expect(400);

    // 200 sí entra, y deja la merma completamente anulada.
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Resto de la devolución', quantity: 200 })
      .expect(201);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Ya no queda nada por anular' })
      .expect(400);
  });

  it('no se puede anular un movimiento que no es una merma', async () => {
    const compra = await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId,
        delta: 100,
        type: 'MANUAL_ADJUSTMENT',
        unitCost: 20,
        notes: 'Ajuste cualquiera',
      })
      .expect(201);

    await request
      .post(`/inventory/movements/${(compra.body as { id: string }).id}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Esto no es una merma' })
      .expect(400);
  });

  it('el cajero no puede anular mermas (es acción de admin)', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'cajero-merma@test.local',
        fullName: 'Cajero Merma',
        role: 'CAJERO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    const cajeroToken = await loginAs(request, 'cajero-merma@test.local');
    const wasteId = await registerWaste(100);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(cajeroToken))
      .send({ reason: 'No debería poder' })
      .expect(403);
  });

  it('la reversa queda en la bitácora con su motivo', async () => {
    const wasteId = await registerWaste(250);
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Motivo auditable de la anulación' })
      .expect(201);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'INVENTORY_MOVEMENT_WASTE_REVERSED', entityId: wasteId },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log!.afterJson)).toContain('Motivo auditable');
  });
});
