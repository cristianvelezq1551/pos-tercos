/**
 * invoice-drafts.e2e-spec.ts
 *
 * Guardar una factura como BORRADOR, para releerla antes de que entre a los
 * libros.
 *
 * La mitad de esta suite prueba lo que el borrador SÍ hace; la otra mitad, con
 * más cuidado, prueba lo que NO debe tocar: inventario, costos, proveedores,
 * tesorería y los reportes. Ese "no tocar nada" es la razón de ser de la
 * función — si un borrador moviera algo, sería una factura confirmada con otro
 * nombre.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const NIT_PROVEEDOR = '901555777-3';

describe('Facturas — borrador (guardar para revisar)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cocineroToken: string;
  let ingredienteId: string;
  let productoReventaId: string;

  const payloadBase = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    supplierNit: NIT_PROVEEDOR,
    supplierName: 'Distribuidora Borrador',
    invoiceNumber: 'B-100',
    total: 60000,
    items: [
      {
        entityType: 'INGREDIENT',
        ingredientId: ingredienteId,
        descriptionRaw: 'Queso doble crema 1 kg',
        quantity: 3,
        unit: 'kg',
        unitPrice: 20000,
        total: 60000,
      },
    ],
    ...over,
  });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-draft@test.local',
          fullName: 'Dueño Borradores',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cocinero-draft@test.local',
          fullName: 'Cocinero Borradores',
          role: 'COCINERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
    });
    duenoToken = await loginAs(request, 'dueno-draft@test.local');
    cocineroToken = await loginAs(request, 'cocinero-draft@test.local');

    const ing = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Queso Borrador',
        unitPurchase: 'kg',
        unitRecipe: 'g',
        conversionFactor: 1000,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    ingredienteId = ing.body.id as string;

    const prod = await request
      .post('/products')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Gaseosa Borrador',
        category: 'Bebidas',
        basePrice: 4000,
        directResale: true,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor: 12,
        thresholdMin: 0,
        isActive: true,
        modifiersEnabled: false,
      })
      .expect(201);
    productoReventaId = prod.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  const guardar = (body: Record<string, unknown>, token = duenoToken) =>
    request.post('/invoices/draft').set('Authorization', `Bearer ${token}`).send(body);

  // =====================================================================
  // Lo que el borrador SÍ hace
  // =====================================================================

  it('guarda el borrador con sus ítems y lo deja pendiente de revisión', async () => {
    const res = await guardar(payloadBase()).expect(201);

    expect(res.body.status).toBe('PENDING_REVIEW');
    expect(res.body.total).toBe(60000);
    expect(res.body.invoiceNumber).toBe('B-100');
    expect(res.body.confirmedAt).toBeNull();
    expect(res.body.paymentStatus).toBeNull();
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].ingredientId).toBe(ingredienteId);
    expect(res.body.items[0].quantity).toBe(3);
  });

  it('acepta ítems de producto de reventa igual que confirmar', async () => {
    const res = await guardar(
      payloadBase({
        total: 48000,
        items: [
          {
            entityType: 'PRODUCT',
            productId: productoReventaId,
            descriptionRaw: 'Gaseosa caja x12',
            quantity: 2,
            unit: 'caja',
            unitPrice: 24000,
            total: 48000,
          },
        ],
      }),
    ).expect(201);
    expect(res.body.items[0].productId).toBe(productoReventaId);
  });

  it('se puede confirmar tal como quedó guardado: ahí sí entra al inventario', async () => {
    const draft = await guardar(payloadBase({ invoiceNumber: 'B-CONF' })).expect(201);

    const confirmado = await request
      .post(`/invoices/${draft.body.id}/confirm`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(payloadBase({ invoiceNumber: 'B-CONF' }))
      .expect(201);

    expect(confirmado.body.status).toBe('CONFIRMED');
    // 3 kg × 1.000 g/kg = 3.000 g de stock, a $20/g.
    const movimientos = await prisma.inventoryMovement.findMany({
      where: { sourceType: 'invoice', sourceId: draft.body.id },
    });
    expect(movimientos).toHaveLength(1);
    expect(Number(movimientos[0]!.delta)).toBe(3000);
    expect(Number(movimientos[0]!.unitCost)).toBe(20);
  });

  it('reemplaza el contenido al volver a guardarlo, sin duplicar ítems', async () => {
    const draft = await guardar(payloadBase()).expect(201);

    const editado = await request
      .put(`/invoices/${draft.body.id}/draft`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(
        payloadBase({
          total: 40000,
          invoiceNumber: 'B-101',
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId: ingredienteId,
              descriptionRaw: 'Queso doble crema 1 kg',
              quantity: 2,
              unit: 'kg',
              unitPrice: 20000,
              total: 40000,
            },
          ],
        }),
      )
      .expect(200);

    expect(editado.body.total).toBe(40000);
    expect(editado.body.invoiceNumber).toBe('B-101');
    expect(editado.body.items).toHaveLength(1);
    expect(editado.body.items[0].quantity).toBe(2);
  });

  it('el borrador se puede borrar y no deja rastro', async () => {
    const draft = await guardar(payloadBase()).expect(201);
    await request
      .delete(`/invoices/${draft.body.id}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(204);
    await request
      .get(`/invoices/${draft.body.id}`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(404);
  });

  it('conserva la conversión a unidad de inventario elegida a mano', async () => {
    // Sin esto, al reanudar volvería la conversión sugerida y al confirmar
    // entraría otra cantidad de mercancía (el daño silencioso de §conversión).
    const draft = await guardar(
      payloadBase({
        items: [
          {
            entityType: 'INGREDIENT',
            ingredientId: ingredienteId,
            descriptionRaw: 'Queso bulto raro',
            quantity: 3,
            unit: 'bulto',
            unitPrice: 20000,
            total: 60000,
            baseFactor: 2500,
          },
        ],
      }),
    ).expect(201);

    const extraccion = await request
      .get(`/invoices/${draft.body.id}/raw-extraction`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(extraccion.body.items[0].baseFactor).toBe(2500);
  });

  it('conserva los avisos de la IA al reanudar y al volver a guardar', async () => {
    const draft = await guardar(
      payloadBase({ warnings: ['El total no cuadra con la suma de las líneas'] }),
    ).expect(201);

    await request
      .put(`/invoices/${draft.body.id}/draft`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(payloadBase())
      .expect(200);

    const extraccion = await request
      .get(`/invoices/${draft.body.id}/raw-extraction`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(extraccion.body.warnings).toEqual(['El total no cuadra con la suma de las líneas']);
  });

  it('la extracción guardada refleja lo REVISADO, no lo que leyó la IA', async () => {
    // El modal inicializa sus campos desde la extracción: si guardara la
    // original, reanudar mostraría los números viejos y guardar no serviría.
    const draft = await guardar(payloadBase({ total: 60000 })).expect(201);
    await request
      .put(`/invoices/${draft.body.id}/draft`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(payloadBase({ total: 65000, iva: 7600, freight: 5000 }))
      .expect(200);

    const extraccion = await request
      .get(`/invoices/${draft.body.id}/raw-extraction`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(extraccion.body.total).toBe(65000);
    expect(extraccion.body.iva).toBe(7600);
    expect(extraccion.body.freight).toBe(5000);
  });

  // =====================================================================
  // Lo que el borrador NO debe tocar
  // =====================================================================

  it('no mueve inventario ni cambia el último costo del insumo', async () => {
    const antes = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredienteId },
      select: { lastUnitCost: true, lastUnitCostDate: true },
    });
    const movimientosAntes = await prisma.inventoryMovement.count({
      where: { ingredientId: ingredienteId },
    });
    const preciosProveedorAntes = await prisma.supplierProduct.count();

    const draft = await guardar(payloadBase()).expect(201);

    const despues = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredienteId },
      select: { lastUnitCost: true, lastUnitCostDate: true },
    });
    const movimientosDespues = await prisma.inventoryMovement.count({
      where: { ingredientId: ingredienteId },
    });

    expect(movimientosDespues).toBe(movimientosAntes);
    expect(despues.lastUnitCost).toEqual(antes.lastUnitCost);
    expect(despues.lastUnitCostDate).toEqual(antes.lastUnitCostDate);
    // Y tampoco quedó registrado como precio de compra de ningún proveedor.
    expect(await prisma.supplierProduct.count()).toBe(preciosProveedorAntes);
    expect(draft.body.status).toBe('PENDING_REVIEW');
  });

  it('no crea el proveedor: un borrador que se borra no debe dejarlo suelto', async () => {
    const draft = await guardar(
      payloadBase({ supplierNit: '999888777-0', supplierName: 'Proveedor Fantasma' }),
    ).expect(201);

    expect(draft.body.supplierId).toBeNull();
    expect(await prisma.supplier.count({ where: { nit: '999888777-0' } })).toBe(0);
  });

  it('no aparece en el reporte de compras ni en las cuentas por pagar', async () => {
    await guardar(
      payloadBase({
        total: 777000,
        invoiceNumber: 'B-INVISIBLE',
        items: [
          {
            entityType: 'INGREDIENT',
            ingredientId: ingredienteId,
            descriptionRaw: 'Queso caro',
            quantity: 3,
            unit: 'kg',
            unitPrice: 259000,
            total: 777000,
          },
        ],
      }),
    ).expect(201);

    const compras = await request
      .get("/reports/purchases")
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    const filas = JSON.stringify(compras.body);
    expect(filas).not.toContain('B-INVISIBLE');
    expect(filas).not.toContain('777000');

    // Cuentas por pagar: solo cuenta facturas CONFIRMED con pago pendiente.
    const tesoreria = await request
      .get('/treasury/summary')
      .set('Authorization', `Bearer ${duenoToken}`)
      .expect(200);
    expect(JSON.stringify(tesoreria.body)).not.toContain('777000');
  });

  // =====================================================================
  // Validación: un borrador siempre tiene que poder confirmarse
  // =====================================================================

  it('rechaza el borrador si el total no se explica con los ítems', async () => {
    const res = await guardar(payloadBase({ total: 999999 })).expect(400);
    expect(String(res.body.message)).toMatch(/total/i);
  });

  it('rechaza el borrador si una línea apunta a un insumo que no existe', async () => {
    await guardar(
      payloadBase({
        items: [
          {
            entityType: 'INGREDIENT',
            ingredientId: '11111111-1111-4111-8111-111111111111',
            descriptionRaw: 'Fantasma',
            quantity: 1,
            unit: 'kg',
            unitPrice: 60000,
            total: 60000,
          },
        ],
      }),
    ).expect(400);
  });

  it('rechaza el borrador sin ítems', async () => {
    await guardar(payloadBase({ items: [], total: 0 })).expect(400);
  });

  it('rechaza el domicilio mayor que el total', async () => {
    await guardar(payloadBase({ freight: 80000 })).expect(400);
  });

  it('no deja guardar como borrador algo ya confirmado', async () => {
    const draft = await guardar(payloadBase({ invoiceNumber: 'B-YA' })).expect(201);
    await request
      .post(`/invoices/${draft.body.id}/confirm`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(payloadBase({ invoiceNumber: 'B-YA' }))
      .expect(201);

    const res = await request
      .put(`/invoices/${draft.body.id}/draft`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(payloadBase({ invoiceNumber: 'B-YA' }))
      .expect(400);
    expect(String(res.body.message)).toMatch(/confirmada|borrador/i);
  });

  it('la cocina no puede guardar borradores de factura', async () => {
    await guardar(payloadBase(), cocineroToken).expect(403);
  });

  it('editar un borrador que no existe da 404', async () => {
    await request
      .put('/invoices/11111111-1111-4111-8111-111111111111/draft')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(payloadBase())
      .expect(404);
  });

  it('deja rastro en la bitácora al guardar y al editar', async () => {
    const draft = await guardar(payloadBase({ invoiceNumber: 'B-AUDIT' })).expect(201);
    await request
      .put(`/invoices/${draft.body.id}/draft`)
      .set('Authorization', `Bearer ${duenoToken}`)
      .send(payloadBase({ invoiceNumber: 'B-AUDIT-2' }))
      .expect(200);

    const acciones = await prisma.auditLog.findMany({
      where: { entityId: draft.body.id as string },
      select: { action: true },
    });
    expect(acciones.map((a) => a.action)).toEqual(
      expect.arrayContaining(['INVOICE_DRAFT_SAVED', 'INVOICE_DRAFT_UPDATED']),
    );
  });
});
