/**
 * E2E del conteo físico ciclado: tareas sugeridas (rotación), registro de
 * conteo ciego, ajuste compensatorio cuando difiere del ledger, y que el
 * faltante alimente el reporte de uso y mermas.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Conteo físico E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let harinaId: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Auto-aislada: no confiar en que la suite anterior limpió. Esta suite lee
    // agregados GLOBALES (reportes / ledger de inventario), así que un residuo
    // de otra suite mueve los números y el fallo depende del orden de archivos.
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-count@test.local',
        fullName: 'Dueño Conteo',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-count@test.local');

    const ingRes = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ name: 'Harina Conteo', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000 })
      .expect(201);
    harinaId = ingRes.body.id as string;

    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'INGREDIENT', ingredientId: harinaId, delta: 100, type: 'INITIAL', unitCost: 5 })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('sugiere contar primero lo nunca contado', async () => {
    const res = await request
      .get('/inventory/count-tasks?limit=10')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const harina = res.body.find((t: { entityId: string }) => t.entityId === harinaId);
    expect(harina).toBeDefined();
    expect(harina.lastCountedAt).toBeNull();
    expect(harina.ledgerQty).toBe(100);
  });

  it('conteo con faltante crea el ajuste compensatorio y corrige el ledger', async () => {
    const res = await request
      .post('/inventory/counts')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        entityType: 'INGREDIENT',
        ingredientId: harinaId,
        countedQty: 90,
        notes: 'Bolsa rota sin declarar',
      })
      .expect(201);

    expect(res.body.ledgerQty).toBe(100);
    expect(res.body.difference).toBe(-10);

    const adjustment = await prisma.inventoryMovement.findFirst({
      where: { sourceType: 'stock_count', sourceId: res.body.id },
    });
    expect(adjustment).not.toBeNull();
    expect(Number(adjustment!.delta)).toBe(-10);
    expect(adjustment!.type).toBe('MANUAL_ADJUSTMENT');

    const stock = await request
      .get(`/inventory/stock/ingredient/${harinaId}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(stock.body.currentStock).toBe(90);
  });

  it('conteo que cuadra NO crea movimiento', async () => {
    const res = await request
      .post('/inventory/counts')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'INGREDIENT', ingredientId: harinaId, countedQty: 90 })
      .expect(201);
    expect(res.body.difference).toBe(0);
    const adjustment = await prisma.inventoryMovement.findFirst({
      where: { sourceType: 'stock_count', sourceId: res.body.id },
    });
    expect(adjustment).toBeNull();
  });

  it('tras contar, el ítem deja de ser prioridad en las tareas', async () => {
    const res = await request
      .get('/inventory/count-tasks?limit=10')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const harina = res.body.find((t: { entityId: string }) => t.entityId === harinaId);
    expect(harina.lastCountedAt).not.toBeNull();
  });

  it('el faltante del conteo aparece como pérdida en uso y mermas', async () => {
    const res = await request
      .get('/reports/inventory-usage')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const harina = res.body.rows.find((r: { entityId: string }) => r.entityId === harinaId);
    expect(harina).toBeDefined();
    expect(harina.adjustments).toBe(-10);
    // lastUnitCost no está seteado (sin factura) → costo desconocido, cuenta en unknownCostCount
    expect(harina.wasteCost).toBeNull();
  });

  it('el historial de conteos lista los registros con nombre y usuario', async () => {
    const res = await request
      .get('/inventory/counts?limit=10')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].name).toBe('Harina Conteo');
    expect(res.body[0].userName).toBe('Dueño Conteo');
  });

  it('un conteo del admin (autoApprove) supersede los PENDING previos del mismo ítem (regresión)', async () => {
    // Bug: solo `approve` rechazaba los PENDING previos — el conteo directo del
    // admin no, y aprobar después el PENDING viejo doble-aplicaba la diferencia.
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'cocinero-count@test.local',
        fullName: 'Cocinero Conteo',
        role: 'COCINERO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    const cocineroToken = await loginAs(request, 'cocinero-count@test.local');

    const ing = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ name: 'Azúcar Doble', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000 })
      .expect(201);
    const azucarId = ing.body.id as string;
    await request
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'INGREDIENT', ingredientId: azucarId, delta: 50, type: 'INITIAL', unitCost: 4 })
      .expect(201);

    // 1. El cocinero cuenta 40 → PENDING (dif −10, sin ajustar).
    await request
      .post('/kitchen/count')
      .set('Authorization', `Bearer ${cocineroToken}`)
      .send({ items: [{ entityType: 'INGREDIENT', ingredientId: azucarId, countedQty: 40 }] })
      .expect(201);
    const pending = await request
      .get('/inventory/counts/pending')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const viejo = (pending.body as Array<{ id: string; entityId: string; status: string }>).find(
      (c) => c.entityId === azucarId,
    );
    expect(viejo?.status).toBe('PENDING');

    // 2. El admin registra SU conteo del mismo ítem (45) → autoApprove ajusta ya.
    const adminCount = await request
      .post('/inventory/counts')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({ entityType: 'INGREDIENT', ingredientId: azucarId, countedQty: 45 })
      .expect(201);
    expect(adminCount.body.status).toBe('APPROVED');
    expect(adminCount.body.difference).toBe(-5);

    // 3. El PENDING viejo quedó REJECTED (superseded): ya no aparece y aprobarlo falla.
    const row = await prisma.stockCount.findUnique({ where: { id: viejo!.id } });
    expect(row?.status).toBe('REJECTED');
    const stillPending = await request
      .get('/inventory/counts/pending')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(
      (stillPending.body as Array<{ entityId: string }>).filter((c) => c.entityId === azucarId),
    ).toHaveLength(0);
    await request
      .post(`/inventory/counts/${viejo!.id}/approve`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({})
      .expect(400);

    // 4. El stock quedó en lo que contó el admin (45) — sin doble aplicación (35).
    const stock = await request
      .get(`/inventory/stock/ingredient/${azucarId}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(stock.body.currentStock).toBe(45);
  });
});
