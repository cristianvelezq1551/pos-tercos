/**
 * kitchen.e2e-spec.ts
 *
 * App de cocina (cocinero): ver stock (sin costos), registrar merma, conteo
 * ciego, bitácora de incidencias y checklist apertura/cierre. Verifica también
 * los guards (un CAJERO no entra) y la administración de ítems (admin-only).
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

/** PNG 1x1 válido: la firma magic-byte tiene que pasar detectImageMime. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

describe('Cocina (kitchen) E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let duenoToken: string;
  let cocineroToken: string;
  let cajeroToken: string;
  let ingredientId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Id de un usuario por email (para filtrar por trabajador). */
  const idOf = async (email: string): Promise<string> =>
    (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

  /** Sube una foto y devuelve su key (la merma no se registra sin ella). */
  const uploadPhoto = async (token: string): Promise<string> => {
    const res = await request
      .post('/kitchen/evidence')
      .set(auth(token))
      .attach('photo', PNG_1X1, { filename: 'merma.png', contentType: 'image/png' })
      .expect(201);
    return res.body.key as string;
  };

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

    it('registra MERMA con foto → descuenta stock', async () => {
      await request
        .post('/kitchen/waste')
        .set(auth(cocineroToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId,
          quantity: 200,
          reason: 'se cayó al piso',
          evidenceKey: await uploadPhoto(cocineroToken),
        })
        .expect(201);
      const res = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
      const carne = res.body.find((s: { id: string }) => s.id === ingredientId);
      expect(carne.currentStock).toBe(4800); // 5000 − 200
    });

    it('merma rechaza motivo vacío (validación Zod)', async () => {
      // Con foto: así el 400 es por el motivo y no por la evidencia faltante.
      await request
        .post('/kitchen/waste')
        .set(auth(cocineroToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId,
          quantity: 10,
          reason: '',
          evidenceKey: await uploadPhoto(cocineroToken),
        })
        .expect(400);
    });

    it('merma SIN foto se rechaza (la evidencia es obligatoria)', async () => {
      const before = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
      const stockBefore = before.body.find((s: { id: string }) => s.id === ingredientId).currentStock;

      await request
        .post('/kitchen/waste')
        .set(auth(cocineroToken))
        .send({ entityType: 'INGREDIENT', ingredientId, quantity: 50, reason: 'se quemó' })
        .expect(400);

      // Y no descontó nada.
      const after = await request.get('/kitchen/stock').set(auth(cocineroToken)).expect(200);
      expect(after.body.find((s: { id: string }) => s.id === ingredientId).currentStock).toBe(
        stockBefore,
      );
    });

    it('la foto de la merma queda en el movimiento y el dueño la puede ver', async () => {
      await request
        .post('/kitchen/waste')
        .set(auth(cocineroToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId,
          quantity: 5,
          reason: 'vencido',
          evidenceKey: await uploadPhoto(cocineroToken),
        })
        .expect(201);

      const movements = await request
        .get(`/inventory/movements?type=WASTE&ingredient_id=${ingredientId}`)
        .set(auth(duenoToken))
        .expect(200);
      const withPhoto = movements.body.find(
        (m: { notes: string | null }) => m.notes === 'vencido',
      );
      expect(withPhoto.evidenceUrl).toBe(`/api/inventory/movements/${withPhoto.id}/evidence`);
      // Y quién la registró, que es la mitad del punto de la evidencia.
      expect(withPhoto.userFullName).toBe('Cocinero K');

      const photo = await request
        .get(`/inventory/movements/${withPhoto.id}/evidence`)
        .set(auth(duenoToken))
        .expect(200);
      expect(photo.headers['content-type']).toBe('image/png');
      expect(photo.body.length).toBe(PNG_1X1.length);
    });

    it('un movimiento sin foto responde 404, no una imagen vacía', async () => {
      const adjust = await request
        .post('/inventory/movements')
        .set(auth(duenoToken))
        .send({ entityType: 'INGREDIENT', ingredientId, delta: 1, type: 'MANUAL_ADJUSTMENT' })
        .expect(201);
      await request
        .get(`/inventory/movements/${adjust.body.id}/evidence`)
        .set(auth(duenoToken))
        .expect(404);
    });

    it('un CAJERO no puede subir evidencia (403) y un archivo que no es imagen se rechaza', async () => {
      await request
        .post('/kitchen/evidence')
        .set(auth(cajeroToken))
        .attach('photo', PNG_1X1, { filename: 'x.png', contentType: 'image/png' })
        .expect(403);

      await request
        .post('/kitchen/evidence')
        .set(auth(cocineroToken))
        .attach('photo', Buffer.from('esto-no-es-una-imagen'), {
          filename: 'x.png',
          contentType: 'image/png',
        })
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

    it('la incidencia acepta foto opcional: con foto se puede ver, sin foto queda en null', async () => {
      const conFoto = await request
        .post('/kitchen/incidents')
        .set(auth(cocineroToken))
        .send({
          category: 'EQUIPO',
          note: 'la nevera gotea',
          evidenceKey: await uploadPhoto(cocineroToken),
        })
        .expect(201);
      expect(conFoto.body.evidenceUrl).toBe(`/api/kitchen/incidents/${conFoto.body.id}/evidence`);

      const photo = await request
        .get(`/kitchen/incidents/${conFoto.body.id}/evidence`)
        .set(auth(duenoToken))
        .expect(200);
      expect(photo.headers['content-type']).toBe('image/png');

      // Sin foto se registra igual: "se fue la luz" no se fotografía.
      const sinFoto = await request
        .post('/kitchen/incidents')
        .set(auth(cocineroToken))
        .send({ category: 'OTRO', note: 'se fue la luz media hora' })
        .expect(201);
      expect(sinFoto.body.evidenceUrl).toBeNull();
      await request
        .get(`/kitchen/incidents/${sinFoto.body.id}/evidence`)
        .set(auth(duenoToken))
        .expect(404);
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

    it('la rutina de hoy arranca sin marcar y lista las tareas activas', async () => {
      const res = await request.get('/kitchen/checklist?type=OPEN').set(auth(cocineroToken)).expect(200);
      expect(res.body.type).toBe('OPEN');
      expect(res.body.totalCount).toBe(2);
      expect(res.body.doneCount).toBe(0);
      expect(res.body.completedAt).toBeNull();
      expect(res.body.legacy).toBe(false);
    });

    it('marcar una tarea la guarda al instante, con autor y hora', async () => {
      const res = await request
        .post('/kitchen/checklist/mark')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN', itemId: itemA, done: true })
        .expect(201);
      expect(res.body.doneCount).toBe(1);
      const marked = res.body.items.find((i: { itemId: string }) => i.itemId === itemA);
      expect(marked.done).toBe(true);
      expect(marked.doneByName).toBe('Cocinero K');
      expect(marked.doneAt).not.toBeNull();

      // Y sobrevive a una lectura nueva: el avance a medias NO se pierde, que
      // era justo lo que antes quedaba sin registrar.
      const reread = await request.get('/kitchen/checklist?type=OPEN').set(auth(cocineroToken)).expect(200);
      expect(reread.body.doneCount).toBe(1);
    });

    it('volver a marcar la misma tarea no cambia el autor original', async () => {
      const res = await request
        .post('/kitchen/checklist/mark')
        .set(auth(duenoToken))
        .send({ type: 'OPEN', itemId: itemA, done: true })
        .expect(201);
      const marked = res.body.items.find((i: { itemId: string }) => i.itemId === itemA);
      expect(marked.doneByName).toBe('Cocinero K');
    });

    it('no se puede cerrar con tareas sin marcar (400)', async () => {
      await request
        .post('/kitchen/checklist/complete')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN' })
        .expect(400);
    });

    it('cierra la rutina cuando están todas y queda registrada', async () => {
      await request
        .post('/kitchen/checklist/mark')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN', itemId: itemB, done: true })
        .expect(201);

      const done = await request
        .post('/kitchen/checklist/complete')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN' })
        .expect(201);
      expect(done.body.completedAt).not.toBeNull();
      expect(done.body.completedByName).toBe('Cocinero K');
      expect(done.body.doneCount).toBe(done.body.totalCount);
    });

    it('desmarcar después de cerrar deja la rutina abierta de nuevo', async () => {
      const res = await request
        .post('/kitchen/checklist/mark')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN', itemId: itemB, done: false })
        .expect(201);
      // Si el cierre sobreviviera, el día diría "cerrado" con una tarea pendiente.
      expect(res.body.completedAt).toBeNull();
      expect(res.body.doneCount).toBe(1);

      // Se deja como estaba para los tests que siguen.
      await request
        .post('/kitchen/checklist/mark')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN', itemId: itemB, done: true })
        .expect(201);
      await request
        .post('/kitchen/checklist/complete')
        .set(auth(cocineroToken))
        .send({ type: 'OPEN' })
        .expect(201);
    });

    it('una tarea desactivada ya no se puede marcar', async () => {
      const extra = await request
        .post('/kitchen/checklist/items')
        .set(auth(duenoToken))
        .send({ type: 'CLOSE', label: 'Apagar campana', sortOrder: 0 })
        .expect(201);
      await request
        .patch(`/kitchen/checklist/items/${extra.body.id}`)
        .set(auth(duenoToken))
        .send({ isActive: false })
        .expect(200);
      await request
        .post('/kitchen/checklist/mark')
        .set(auth(cocineroToken))
        .send({ type: 'CLOSE', itemId: extra.body.id, done: true })
        .expect(400);
    });

    it('el histórico muestra el día cumplido y el que no; el cocinero no lo ve (403)', async () => {
      await request.get('/kitchen/checklist/history').set(auth(cocineroToken)).expect(403);

      const res = await request.get('/kitchen/checklist/history').set(auth(duenoToken)).expect(200);
      const today = new Date().toLocaleDateString('en-CA');

      const open = res.body.find(
        (d: { day: string; type: string }) => d.day === today && d.type === 'OPEN',
      );
      expect(open.completedAt).not.toBeNull();
      expect(open.doneCount).toBe(open.totalCount);

      // La rutina de CIERRE de hoy no se hizo: tiene que aparecer, no faltar.
      const close = res.body.find(
        (d: { day: string; type: string }) => d.day === today && d.type === 'CLOSE',
      );
      expect(close).toBeDefined();
      expect(close.completedAt).toBeNull();
    });

    it('un día cerrado ANTES de las marcas por tarea se lee igual, marcado como legacy', async () => {
      // Simula lo que dejó el modelo viejo: una rutina cerrada con la lista de
      // tareas dentro de `done_item_ids` y CERO filas en checklist_marks.
      const hace3 = new Date(Date.now() - 3 * 86_400_000);
      const dia = hace3.toLocaleDateString('en-CA');
      const viejo = await prisma.checklistItem.create({
        data: { type: 'CLOSE', label: 'Trapear piso', sortOrder: 0, createdAt: hace3 },
      });
      const cocinero = await prisma.user.findUniqueOrThrow({
        where: { email: 'cocinero-k@test.local' },
      });
      await prisma.checklistCompletion.create({
        data: {
          type: 'CLOSE',
          day: dia,
          doneItemIds: [viejo.id],
          completedById: cocinero.id,
        },
      });

      const res = await request
        .get(`/kitchen/checklist/history?from=${dia}&to=${dia}`)
        .set(auth(duenoToken))
        .expect(200);
      const close = res.body.find((d: { type: string }) => d.type === 'CLOSE');

      expect(close.legacy).toBe(true);
      expect(close.completedByName).toBe('Cocinero K');
      const tarea = close.items.find((i: { itemId: string }) => i.itemId === viejo.id);
      expect(tarea.done).toBe(true);
      // No hay autor por tarea en los días viejos: se dice, no se inventa.
      expect(tarea.doneByName).toBeNull();
    });

    it('el histórico rechaza un rango invertido o demasiado largo', async () => {
      await request
        .get('/kitchen/checklist/history?from=2026-08-10&to=2026-08-01')
        .set(auth(duenoToken))
        .expect(400);
      await request
        .get('/kitchen/checklist/history?from=2020-01-01&to=2026-08-01')
        .set(auth(duenoToken))
        .expect(400);
    });

    it('una tarea creada hoy no cuenta como incumplida en días anteriores', async () => {
      const today = new Date().toLocaleDateString('en-CA');
      const res = await request
        .get(`/kitchen/checklist/history?from=${today}&to=${today}`)
        .set(auth(duenoToken))
        .expect(200);
      // Las tareas de la suite se crearon hoy; ayer no existían.
      const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
      const prev = await request
        .get(`/kitchen/checklist/history?from=${ayer}&to=${ayer}`)
        .set(auth(duenoToken))
        .expect(200);
      expect(res.body.find((d: { type: string }) => d.type === 'OPEN').totalCount).toBe(2);
      expect(prev.body.find((d: { type: string }) => d.type === 'OPEN').totalCount).toBe(0);
    });
  });

  describe('Vistas del dueño: producción, merma y resumen', () => {
    let subproductId: string;

    beforeAll(async () => {
      const sub = await request
        .post('/subproducts')
        .set(auth(duenoToken))
        .send({ name: 'Salsa K', yield: 10, unit: 'porción', thresholdMin: 0 })
        .expect(201);
      subproductId = sub.body.id as string;
      await request
        .put(`/subproducts/${subproductId}/recipe`)
        .set(auth(duenoToken))
        .send({ edges: [{ childType: 'ingredient', childId: ingredientId, quantityNeta: 100 }] })
        .expect(200);
    });

    it('la producción vuelve agrupada por TANDA, con insumos, autor y foto', async () => {
      const evidenceKey = await uploadPhoto(cocineroToken);
      await request
        .post(`/subproducts/${subproductId}/produce`)
        .set(auth(cocineroToken))
        .send({
          quantityProduced: 20,
          notes: 'tanda de la mañana',
          evidenceKey,
          idempotencyKey: randomUUID(),
        })
        .expect(201);

      const res = await request.get('/kitchen/productions').set(auth(duenoToken)).expect(200);
      const run = res.body.find((r: { subproductId: string }) => r.subproductId === subproductId);

      expect(run.quantityProduced).toBe(20);
      expect(run.userName).toBe('Cocinero K');
      expect(run.notes).toBe('tanda de la mañana');
      expect(run.evidenceUrl).not.toBeNull();
      // Una tanda son N movimientos; acá tiene que venir UNA fila con sus insumos.
      expect(run.inputs.length).toBe(1);
      expect(run.inputs[0].name).toBe('Carne K');
      expect(run.inputs[0].quantity).toBe(200); // 20/10 × 100 g
      expect(run.inputs[0].unit).toBe('g');
    });

    it('la producción se puede filtrar por trabajador', async () => {
      const mias = await request
        .get(`/kitchen/productions?user_id=${await idOf('cocinero-k@test.local')}`)
        .set(auth(duenoToken))
        .expect(200);
      expect(mias.body.length).toBeGreaterThan(0);

      const ajenas = await request
        .get(`/kitchen/productions?user_id=${await idOf('cajero-k@test.local')}`)
        .set(auth(duenoToken))
        .expect(200);
      expect(ajenas.body).toEqual([]);
    });

    it('la merma trae costo real, motivo, autor y foto; anularla lo netea', async () => {
      // Carga con costo conocido para que el FIFO tenga de dónde valorizar.
      await request
        .post('/inventory/movements')
        .set(auth(duenoToken))
        // Entrada con costo conocido (PURCHASE la genera el sistema, no la API).
        .send({
          entityType: 'INGREDIENT',
          ingredientId,
          delta: 1000,
          type: 'MANUAL_ADJUSTMENT',
          unitCost: 2,
        })
        .expect(201);
      await request
        .post('/kitchen/waste')
        .set(auth(cocineroToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId,
          quantity: 100,
          reason: 'se quemó la tanda',
          evidenceKey: await uploadPhoto(cocineroToken),
        })
        .expect(201);

      const res = await request.get('/kitchen/waste').set(auth(duenoToken)).expect(200);
      const entry = res.body.find((w: { reason: string }) => w.reason === 'se quemó la tanda');
      expect(entry.quantity).toBe(100);
      expect(entry.userName).toBe('Cocinero K');
      expect(entry.evidenceUrl).not.toBeNull();
      expect(entry.costAmount).toBeGreaterThan(0);
      expect(entry.reversedQty).toBe(0);

      await request
        .post(`/inventory/movements/${entry.movementId}/reverse-waste`)
        .set(auth(duenoToken))
        .send({ quantity: 100, reason: 'fue error de dedo' })
        .expect(201);

      const after = await request.get('/kitchen/waste').set(auth(duenoToken)).expect(200);
      const reversed = after.body.find(
        (w: { movementId: string }) => w.movementId === entry.movementId,
      );
      expect(reversed.reversedQty).toBe(100);
    });

    it('el resumen por día trae rutinas, producción, merma e incidencias por persona', async () => {
      const res = await request.get('/kitchen/activity').set(auth(duenoToken)).expect(200);
      const today = new Date().toLocaleDateString('en-CA');
      const day = res.body.find((d: { day: string }) => d.day === today);

      expect(day.productionRuns).toBeGreaterThan(0);
      expect(day.wasteEntries).toBeGreaterThan(0);
      expect(day.incidentsLogged).toBeGreaterThan(0);
      expect(day.openRoutine.completed).toBe(true);
      expect(day.closeRoutine.completed).toBe(false);

      const cocinero = day.users.find((u: { userName: string }) => u.userName === 'Cocinero K');
      expect(cocinero.productionRuns).toBeGreaterThan(0);
      expect(cocinero.checklistMarks).toBeGreaterThan(0);
    });

    it('el cocinero no ve ninguna de las tres vistas del dueño (403)', async () => {
      await request.get('/kitchen/productions').set(auth(cocineroToken)).expect(403);
      await request.get('/kitchen/waste').set(auth(cocineroToken)).expect(403);
      await request.get('/kitchen/activity').set(auth(cocineroToken)).expect(403);
    });
  });
});
