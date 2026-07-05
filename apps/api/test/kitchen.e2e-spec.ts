/**
 * kitchen.e2e-spec.ts
 *
 * App de cocina (cocinero): ver stock (sin costos), registrar merma, conteo
 * ciego, bitácora de incidencias y checklist apertura/cierre. Verifica también
 * los guards (un CAJERO no entra) y la administración de ítems (admin-only).
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Cocina (kitchen) E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cocineroToken: string;
  let cajeroToken: string;
  let ingredientId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        { email: 'dueno-k@test.local', fullName: 'Dueño K', role: 'DUENO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cocinero-k@test.local', fullName: 'Cocinero K', role: 'COCINERO', passwordHash: hash, mustChangePwd: false, active: true },
        { email: 'cajero-k@test.local', fullName: 'Cajero K', role: 'CAJERO', passwordHash: hash, mustChangePwd: false, active: true },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-k@test.local');
    cocineroToken = await loginAs(request, 'cocinero-k@test.local');
    cajeroToken = await loginAs(request, 'cajero-k@test.local');

    const ing = await request
      .post('/ingredients')
      .set(auth(duenoToken))
      .send({ name: 'Carne K', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 100 })
      .expect(201);
    ingredientId = ing.body.id as string;
    await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({ entityType: 'INGREDIENT', ingredientId, delta: 5000, type: 'INITIAL', unitCost: 30 })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('Inventario de cocina', () => {
    it('lista stock SIN exponer costos (lastUnitCost)', async () => {
      const res = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
      const carne = res.body.find((s: { id: string }) => s.id === ingredientId);
      expect(carne).toBeTruthy();
      expect(carne.currentStock).toBe(5000);
      expect(carne).not.toHaveProperty('lastUnitCost');
    });

    it('un CAJERO NO puede entrar a la cocina (403)', async () => {
      await request.get('/kitchen/stock').set(auth(cajeroToken)).expect(403);
    });

    it('registra MERMA → descuenta stock', async () => {
      await request
        .post('/kitchen/waste')
        .set(auth(cocineroToken))
        .send({ entityType: 'INGREDIENT', ingredientId, quantity: 200, reason: 'se cayó al piso' })
        .expect(201);
      const res = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
      const carne = res.body.find((s: { id: string }) => s.id === ingredientId);
      expect(carne.currentStock).toBe(4800); // 5000 − 200
    });

    it('merma rechaza motivo vacío (validación Zod)', async () => {
      await request
        .post('/kitchen/waste')
        .set(auth(cocineroToken))
        .send({ entityType: 'INGREDIENT', ingredientId, quantity: 10, reason: '' })
        .expect(400);
    });

    it('conteo del cocinero queda PENDIENTE (no ajusta) hasta que el admin lo aprueba', async () => {
      const stockOf = async (token: string): Promise<number> => {
        const r = await request.get('/kitchen/stock').set(auth(token)).expect(200);
        return r.body.find((s: { id: string }) => s.id === ingredientId).currentStock;
      };
      // Stock actual (tests previos de la suite pueden haberlo movido con merma).
      const stockBefore = await stockOf(cocineroToken);

      // 1. El cocinero cuenta 4000. Queda PENDING, adjusted:0.
      const res = await request
        .post('/kitchen/count')
        .set(auth(cocineroToken))
        .send({ items: [{ entityType: 'INGREDIENT', ingredientId, countedQty: 4000 }] })
        .expect(201);
      expect(res.body).toEqual({ counted: 1, adjusted: 0 });

      // 2. El stock NO cambió todavía (sigue en lo que había antes de contar).
      expect(await stockOf(cocineroToken)).toBe(stockBefore);

      // 3. El admin ve el conteo pendiente y lo aprueba → recién ahí ajusta.
      const pending = await request.get('/inventory/counts/pending').set(auth(duenoToken)).expect(200);
      const mine = (pending.body as Array<{ id: string; entityId: string; status: string }>).find(
        (c) => c.entityId === ingredientId,
      );
      expect(mine?.status).toBe('PENDING');
      await request.post(`/inventory/counts/${mine!.id}/approve`).set(auth(duenoToken)).send({}).expect(201);

      // 4. Ahora sí el stock quedó en lo contado (4000).
      const after = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
      expect(after.body.find((s: { id: string }) => s.id === ingredientId).currentStock).toBe(4000);
    });

    it('dos conteos pendientes del mismo ítem: aprobar uno supersede el otro (no doble-aplica)', async () => {
      const stockOf = async (): Promise<number> => {
        const r = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
        return r.body.find((s: { id: string }) => s.id === ingredientId).currentStock;
      };
      const before = await stockOf(); // 4000 tras el test anterior
      // El cocinero cuenta el MISMO ítem dos veces (dos pendientes).
      await request.post('/kitchen/count').set(auth(cocineroToken))
        .send({ items: [{ entityType: 'INGREDIENT', ingredientId, countedQty: 3500 }] }).expect(201);
      await request.post('/kitchen/count').set(auth(cocineroToken))
        .send({ items: [{ entityType: 'INGREDIENT', ingredientId, countedQty: 3000 }] }).expect(201);

      const pending = await request.get('/inventory/counts/pending').set(auth(duenoToken)).expect(200);
      const mine = (pending.body as Array<{ id: string; entityId: string }>).filter((c) => c.entityId === ingredientId);
      expect(mine).toHaveLength(2);

      // Aprobar el primero (contó 3500 → dif -500 sobre 4000).
      await request.post(`/inventory/counts/${mine[0]!.id}/approve`).set(auth(duenoToken)).send({}).expect(201);

      // El otro pendiente quedó superseded (rechazado), NO se puede aprobar.
      await request.post(`/inventory/counts/${mine[1]!.id}/approve`).set(auth(duenoToken)).send({}).expect(400);

      // El stock se ajustó UNA sola vez (al valor del conteo aprobado), sin doble-aplicar.
      expect(await stockOf()).toBe(before - 500);
      const stillPending = await request.get('/inventory/counts/pending').set(auth(duenoToken)).expect(200);
      expect((stillPending.body as Array<{ entityId: string }>).filter((c) => c.entityId === ingredientId)).toHaveLength(0);
    });
  });

  describe('Bitácora de incidencias', () => {
    it('el cocinero registra una incidencia y aparece en la lista', async () => {
      const created = await request
        .post('/kitchen/incidents')
        .set(auth(cocineroToken))
        .send({ category: 'INSUMO', note: 'Llegó pollo con mal olor' })
        .expect(201);
      expect(created.body.authorName).toBe('Cocinero K');
      expect(created.body.resolvedAt).toBeNull();

      const list = await request
        .get('/kitchen/incidents?only_open=true')
        .set(auth(cocineroToken))
        .expect(200);
      expect(list.body.some((i: { id: string }) => i.id === created.body.id)).toBe(true);
    });

    it('el admin/dueño resuelve la incidencia; el cocinero NO (403)', async () => {
      const created = await request
        .post('/kitchen/incidents')
        .set(auth(cocineroToken))
        .send({ category: 'EQUIPO', note: 'La freidora no calienta' })
        .expect(201);

      await request.post(`/kitchen/incidents/${created.body.id}/resolve`).set(auth(cocineroToken)).expect(403);

      const resolved = await request
        .post(`/kitchen/incidents/${created.body.id}/resolve`)
        .set(auth(duenoToken))
        .expect(201);
      expect(resolved.body.resolvedAt).not.toBeNull();
      expect(resolved.body.resolvedById).toBeTruthy();

      // No se puede resolver dos veces.
      await request.post(`/kitchen/incidents/${created.body.id}/resolve`).set(auth(duenoToken)).expect(400);
    });
  });

  describe('Checklist apertura/cierre', () => {
    let itemA: string;
    let itemB: string;

    it('el admin crea ítems; el cocinero NO puede crearlos (403)', async () => {
      await request
        .post('/kitchen/checklist/items')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN', label: 'Prender plancha' })
        .expect(403);

      const a = await request
        .post('/kitchen/checklist/items')
        .set(auth(duenoToken))
        .send({ type: 'OPEN', label: 'Prender plancha', sortOrder: 0 })
        .expect(201);
      const b = await request
        .post('/kitchen/checklist/items')
        .set(auth(duenoToken))
        .send({ type: 'OPEN', label: 'Sacar insumos del refri', sortOrder: 1 })
        .expect(201);
      itemA = a.body.id;
      itemB = b.body.id;
    });

    it('la rutina de hoy arranca sin completar y lista los ítems activos', async () => {
      const res = await request.get('/kitchen/checklist?type=OPEN').set(auth(cocineroToken)).expect(200);
      expect(res.body.type).toBe('OPEN');
      expect(res.body.items.length).toBe(2);
      expect(res.body.completedAt).toBeNull();
    });

    it('no se puede completar con ítems faltantes (400)', async () => {
      await request
        .post('/kitchen/checklist/complete')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN', doneItemIds: [itemA] })
        .expect(400);
    });

    it('completa la rutina con todos los ítems y queda registrada', async () => {
      const done = await request
        .post('/kitchen/checklist/complete')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN', doneItemIds: [itemA, itemB] })
        .expect(201);
      expect(done.body.completedAt).not.toBeNull();
      expect(done.body.completedByName).toBe('Cocinero K');
    });
  });
});
