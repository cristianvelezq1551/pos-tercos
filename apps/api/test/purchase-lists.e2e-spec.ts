/**
 * Lista de faltantes armada a mano (2026-08-26). Cubre lo que puede salir mal
 * y costar plata: cantidades que no cuadran con lo que se pidió, ítems
 * duplicados que hacen comprar el doble, el papel del proveedor filtrando
 * costos, y listas cerradas que se siguen editando.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

interface ListDto {
  id: string;
  status: string;
  items: Array<{
    id: string;
    entityName: string;
    quantity: number;
    unitPurchase: string;
    unitStock: string;
    conversionFactor: number;
    currentStock: number;
    thresholdMin: number;
    estTotal: number | null;
    supplierId: string | null;
    supplierName: string | null;
  }>;
  estTotal: number;
  itemsWithoutCost: number;
}

describe('Lista de faltantes E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let cocineroToken: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Insumo con umbral, stock y —opcionalmente— costo por unidad de compra. */
  const makeIngredient = async (opts: {
    name: string;
    threshold: number;
    stock: number;
    conversionFactor?: number;
    unitCost?: number;
  }) => {
    const ing = await request
      .post('/ingredients')
      .set(auth())
      .send({
        name: opts.name,
        unitPurchase: 'paquete',
        unitRecipe: 'unidad',
        conversionFactor: opts.conversionFactor ?? 1,
        thresholdMin: opts.threshold,
      })
      .expect(201);
    if (opts.stock !== 0) {
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({
          entityType: 'INGREDIENT',
          ingredientId: ing.body.id,
          delta: opts.stock,
          type: 'INITIAL',
          unitCost: opts.unitCost ?? 100,
        })
        .expect(201);
    }
    if (opts.unitCost !== undefined) {
      await prisma.ingredient.update({
        where: { id: ing.body.id },
        data: { lastUnitCost: opts.unitCost },
      });
    }
    return ing.body.id as string;
  };

  const createList = async (body: Record<string, unknown> = {}) =>
    (await request.post('/purchase-lists').set(auth()).send(body).expect(201)).body as ListDto;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    // Limpiar también al ARRANCAR: si la suite anterior se cayó a mitad, su
    // `afterAll` no corrió y dejó datos (una caja OPEN basta para tumbar a
    // todas las siguientes). No fiarse de que la anterior haya limpiado.
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-pl@test.local',
        fullName: 'Dueño PL',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    await prisma.user.create({
      data: {
        email: 'cocinero-pl@test.local',
        fullName: 'Cocinero PL',
        role: 'COCINERO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-pl@test.local');
    cocineroToken = await loginAs(request, 'cocinero-pl@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('los costos no se le muestran a un rol operativo (403)', async () => {
    await request
      .get('/purchase-lists')
      .set({ Authorization: `Bearer ${cocineroToken}` })
      .expect(403);
  });

  it('los candidatos traen existencias, mínimo y cuánto falta, con lo urgente arriba', async () => {
    await makeIngredient({ name: 'PL Pan', threshold: 30, stock: 21, conversionFactor: 12 });
    await makeIngredient({ name: 'PL Sobrado', threshold: 5, stock: 50 });

    const res = await request.get('/purchase-lists/candidates?only_low=true').set(auth()).expect(200);
    const rows = res.body as Array<Record<string, unknown>>;

    const pan = rows.find((r) => r.name === 'PL Pan')!;
    expect(pan.belowMinimum).toBe(true);
    expect(pan.deficitStock).toBe(9); // 30 − 21 unidades
    expect(pan.suggestedQty).toBe(1); // 9 unidades = 0,75 paquete → 1
    expect(pan.unitStock).toBe('unidad');
    expect(pan.unitPurchase).toBe('paquete');
    // El que está sobrado no aparece con only_low.
    expect(rows.find((r) => r.name === 'PL Sobrado')).toBeUndefined();
  });

  it('una lista puede nacer llena con todo lo que está bajo el mínimo', async () => {
    const list = await createList({ title: 'Pedido del lunes', prefillFromLowStock: true });
    expect(list.status).toBe('DRAFT');
    expect(list.items.length).toBeGreaterThan(0);
    const pan = list.items.find((i) => i.entityName === 'PL Pan');
    expect(pan).toBeDefined();
    expect(pan!.quantity).toBe(1);
    // Snapshot de unidades: sin esto el papel no puede decir de qué son los números.
    expect(pan!.unitStock).toBe('unidad');
    expect(pan!.conversionFactor).toBe(12);
  });

  it('agregar dos veces el mismo insumo NO crea dos renglones: actualiza la cantidad', async () => {
    const ingId = await makeIngredient({ name: 'PL Queso', threshold: 10, stock: 2 });
    const list = await createList();

    await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'INGREDIENT', entityId: ingId, quantity: 3 })
      .expect(201);
    const second = await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'INGREDIENT', entityId: ingId, quantity: 9 })
      .expect(201);

    const body = second.body as ListDto;
    const renglones = body.items.filter((i) => i.entityName === 'PL Queso');
    expect(renglones).toHaveLength(1);
    expect(renglones[0].quantity).toBe(9);
  });

  it('cambiar QUÉ y CUÁNTO se compra queda en auditoría, con quién lo cambió', async () => {
    // Regresión: `upsertItem` recibía el userId y no lo usaba, así que era la
    // única mutación de la feature sin rastro — crear, editar, cerrar y borrar
    // sí lo dejaban. Cambiar la cantidad de una lista es cambiar cuánta plata
    // se va a gastar.
    const ingId = await makeIngredient({ name: 'PL Auditada', threshold: 10, stock: 1 });
    const list = await createList();

    await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'INGREDIENT', entityId: ingId, quantity: 4 })
      .expect(201);

    const entries = await prisma.auditLog.findMany({
      where: { action: 'PURCHASE_LIST_UPDATED', entityId: list.id },
    });
    const deItem = entries.filter(
      (e) => (e.metadata as { stage?: string } | null)?.stage === 'item',
    );
    expect(deItem).toHaveLength(1);
    expect(deItem[0].userId).toBeTruthy();
    expect((deItem[0].metadata as { quantity?: number }).quantity).toBe(4);
  });

  it('el total suma solo lo que tiene costo y avisa cuántos quedaron fuera', async () => {
    const conCosto = await makeIngredient({
      name: 'PL ConCosto',
      threshold: 10,
      stock: 0,
      unitCost: 5000,
    });
    const sinCosto = await makeIngredient({ name: 'PL SinCosto', threshold: 10, stock: 0 });
    const list = await createList();

    await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'INGREDIENT', entityId: conCosto, quantity: 4 })
      .expect(201);
    const res = await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'INGREDIENT', entityId: sinCosto, quantity: 2 })
      .expect(201);

    const body = res.body as ListDto;
    // 4 × $5.000. El sin costo NO suma 0 disimuladamente: se reporta aparte.
    expect(body.estTotal).toBe(20000);
    expect(body.itemsWithoutCost).toBe(1);
  });

  it('cambiar la cantidad recalcula el costo del renglón', async () => {
    const ingId = await makeIngredient({
      name: 'PL Recalcula',
      threshold: 10,
      stock: 0,
      unitCost: 1000,
    });
    const list = await createList();
    const added = (
      await request
        .post(`/purchase-lists/${list.id}/items`)
        .set(auth())
        .send({ entityType: 'INGREDIENT', entityId: ingId, quantity: 2 })
        .expect(201)
    ).body as ListDto;
    const itemId = added.items.find((i) => i.entityName === 'PL Recalcula')!.id;

    const res = await request
      .patch(`/purchase-lists/${list.id}/items/${itemId}`)
      .set(auth())
      .send({ quantity: 7 })
      .expect(200);
    const item = (res.body as ListDto).items.find((i) => i.id === itemId)!;
    expect(item.quantity).toBe(7);
    expect(item.estTotal).toBe(7000);
  });

  it('una preparación de cocina no se puede pedir: se produce', async () => {
    const sub = await prisma.subproduct.create({
      data: { name: 'PL Sub', unit: 'unidad', yield: 1, thresholdMin: 5, isActive: true },
    });
    const list = await createList();
    const res = await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'SUBPRODUCT', entityId: sub.id, quantity: 1 })
      .expect(400);
    expect(String(res.body.message)).toMatch(/se producen/i);
    await prisma.subproduct.delete({ where: { id: sub.id } });
  });

  it('el papel del proveedor NO lleva costos; el general SÍ', async () => {
    const supplier = (
      await request
        .post('/suppliers')
        .set(auth())
        .send({ nit: '900123456', name: 'PL Proveedor', phone: '+573001112233' })
        .expect(201)
    ).body as { id: string };
    const ingId = await makeIngredient({
      name: 'PL ConProveedor',
      threshold: 10,
      stock: 0,
      unitCost: 3000,
    });
    const list = await createList();
    await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({
        entityType: 'INGREDIENT',
        entityId: ingId,
        quantity: 5,
        supplierId: supplier.id,
      })
      .expect(201);

    const general = (
      await request.get(`/purchase-lists/${list.id}/document`).set(auth()).expect(200)
    ).body as { estTotal: number; items: Array<{ estTotal: number | null }> };
    expect(general.estTotal).toBe(15000);
    expect(general.items[0].estTotal).toBe(15000);

    const delProveedor = (
      await request
        .get(`/purchase-lists/${list.id}/document/supplier?supplier_id=${supplier.id}`)
        .set(auth())
        .expect(200)
    ).body as { estTotal: number | null; items: Array<{ estTotal: number | null }> };
    // §7.v19: con proveedores no se habla de precios — y el costo que tenemos
    // pudo ser el de su competencia.
    expect(delProveedor.estTotal).toBeNull();
    expect(delProveedor.items.every((i) => i.estTotal === null)).toBe(true);
  });

  it('una lista cerrada ya no se edita', async () => {
    const ingId = await makeIngredient({ name: 'PL Cierra', threshold: 10, stock: 0 });
    const list = await createList();
    await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'INGREDIENT', entityId: ingId })
      .expect(201);

    const cerrada = (
      await request.post(`/purchase-lists/${list.id}/close`).set(auth()).expect(201)
    ).body as ListDto;
    expect(cerrada.status).toBe('CLOSED');

    await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'INGREDIENT', entityId: ingId })
      .expect(400);
    await request.delete(`/purchase-lists/${list.id}`).set(auth()).expect(400);
  });

  it('no se puede cerrar una lista vacía', async () => {
    const list = await createList();
    const res = await request.post(`/purchase-lists/${list.id}/close`).set(auth()).expect(400);
    expect(String(res.body.message)).toMatch(/vacía/i);
  });

  it('dos personas cerrando a la vez: solo una gana', async () => {
    const ingId = await makeIngredient({ name: 'PL Carrera', threshold: 10, stock: 0 });
    const list = await createList();
    await request
      .post(`/purchase-lists/${list.id}/items`)
      .set(auth())
      .send({ entityType: 'INGREDIENT', entityId: ingId })
      .expect(201);

    const [a, b] = await Promise.all([
      request.post(`/purchase-lists/${list.id}/close`).set(auth()),
      request.post(`/purchase-lists/${list.id}/close`).set(auth()),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
  });

  it('un borrador se puede borrar y desaparece del historial', async () => {
    const list = await createList({ title: 'PL Descartable' });
    await request.delete(`/purchase-lists/${list.id}`).set(auth()).expect(200);
    await request.get(`/purchase-lists/${list.id}`).set(auth()).expect(404);
  });
});
