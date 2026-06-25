/**
 * invoices.e2e-spec.ts
 *
 * Tests de integración para el flujo de facturas (sin LLM):
 *   - Crear proveedor + insumo
 *   - Crear una invoice directamente en DB como PENDING_REVIEW (simula upload)
 *   - Confirmar la invoice via POST /invoices/:id/confirm
 *   - Verificar que se crearon inventory_movements PURCHASE y se actualizó lastUnitCost
 *
 * No se usa upload-photo (requeriría mock LLM). En cambio, se crea un draft
 * via from-clone sobre una invoice CONFIRMED creada directamente con el service.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Invoices E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let adminToken: string;
  let duenoUserId: string;
  let ingredientId: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const hash = await bcrypt.hash('dev12345', 10);

    const [dueno] = await Promise.all([
      prisma.user.create({
        data: {
          email: 'dueno-inv@test.local',
          fullName: 'Dueño Invoices',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      }),
      prisma.user.create({
        data: {
          email: 'admin-inv@test.local',
          fullName: 'Admin Invoices',
          role: 'ADMIN_OPERATIVO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      }),
    ]);

    duenoUserId = dueno.id;
    duenoToken = await loginAs(request, 'dueno-inv@test.local');
    adminToken = await loginAs(request, 'admin-inv@test.local');

    // Crear proveedor vía API
    const supplierRes = await request
      .post('/suppliers')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Proveedor Test Invoice',
        nit: '900123456-1',
        contactName: 'Juan Test',
        phone: '3001234567',
        isActive: true,
      })
      .expect(201);

    expect(supplierRes.body.id).toBeDefined();

    // Crear insumo vía API
    const ingRes = await request
      .post('/ingredients')
      .set('Authorization', `Bearer ${duenoToken}`)
      .send({
        name: 'Harina Test',
        unitPurchase: 'kg',
        unitRecipe: 'g',
        conversionFactor: 1000,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);

    ingredientId = ingRes.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Confirmación de invoice PENDING_REVIEW
  // ---------------------------------------------------------------------------
  describe('POST /invoices/:id/confirm', () => {
    let draftInvoiceId: string;

    beforeEach(async () => {
      // Crear draft directamente en DB (simula resultado de upload-photo sin LLM)
      const draft = await prisma.invoice.create({
        data: {
          status: 'PENDING_REVIEW',
          aiModelUsed: 'test-mock',
          aiExtractionJson: {
            supplierName: 'Proveedor Test Invoice',
            supplierNit: '900123456-1',
            invoiceNumber: 'F-001',
            total: 50000,
            iva: null,
            items: [
              {
                descriptionRaw: 'Harina Test',
                quantity: 5,
                unit: 'kg',
                unitPrice: 10000,
                total: 50000,
              },
            ],
            warnings: [],
          },
          uploadedById: duenoUserId,
        },
      });
      draftInvoiceId = draft.id;
    });

    it('confirma la invoice, crea movement PURCHASE y actualiza lastUnitCost', async () => {
      const UNIT_PRICE = 10000; // COP por kg
      const QUANTITY = 5;
      const TOTAL = 50000;

      const res = await request
        .post(`/invoices/${draftInvoiceId}/confirm`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          supplierNit: '900123456-1',
          supplierName: 'Proveedor Test Invoice',
          invoiceNumber: 'F-001',
          total: TOTAL,
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId,
              descriptionRaw: 'Harina Test',
              quantity: QUANTITY,
              unit: 'kg',
              unitPrice: UNIT_PRICE,
              total: TOTAL,
            },
          ],
        })
        .expect(201);

      const invoice = res.body;
      expect(invoice.status).toBe('CONFIRMED');
      expect(invoice.confirmedAt).toBeTruthy();

      // Verificar que se creó un inventory_movement PURCHASE en DB
      const movement = await prisma.inventoryMovement.findFirst({
        where: {
          entityType: 'INGREDIENT',
          ingredientId,
          type: 'PURCHASE',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(movement).not.toBeNull();
      expect(Number(movement!.delta)).toBeGreaterThan(0);

      // Verificar que se actualizó lastUnitCost del insumo
      const ingredient = await prisma.ingredient.findUnique({
        where: { id: ingredientId },
      });
      expect(ingredient!.lastUnitCost).not.toBeNull();
      expect(Number(ingredient!.lastUnitCost)).toBe(UNIT_PRICE);
    });

    it('baseFactor convierte exacto a la unidad base (FIFO correcto aunque la unidad difiera)', async () => {
      // Compra "FILETE 150 g X 10 U": 5 paquetes, 1 paquete = 1500 g (10×150).
      // El insumo está configurado en kg→g, pero esta compra viene en "unidad":
      // baseFactor garantiza que entren 7.500 g (no 5.000 por el factor default).
      const QUANTITY = 5;
      const UNIT_PRICE = 39750;
      const TOTAL = 198750;
      const BASE_FACTOR = 1500;

      await request
        .post(`/invoices/${draftInvoiceId}/confirm`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          supplierNit: '900123456-1',
          supplierName: 'Proveedor Test Invoice',
          invoiceNumber: 'F-PACK',
          total: TOTAL,
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId,
              descriptionRaw: 'FILETE 150 g X 10 U',
              quantity: QUANTITY,
              unit: 'unidad',
              unitPrice: UNIT_PRICE,
              total: TOTAL,
              baseFactor: BASE_FACTOR,
            },
          ],
        })
        .expect(201);

      const movement = await prisma.inventoryMovement.findFirst({
        where: { entityType: 'INGREDIENT', ingredientId, type: 'PURCHASE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(Number(movement!.delta)).toBe(QUANTITY * BASE_FACTOR); // 7.500 g
      // Costo por unidad base = total / gramos recibidos = $26,5/g exacto.
      expect(Number(movement!.unitCost)).toBeCloseTo(TOTAL / (QUANTITY * BASE_FACTOR), 4);

      // lastUnitCost se re-escala a la unidad de compra (Kg): $26,5/g × 1000 =
      // $26.500/Kg, NO el $39.750 crudo de la línea (eso inflaba el costo de los
      // subproductos). conversionFactor del insumo = 1000 (kg→g).
      const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
      expect(Number(ing!.lastUnitCost)).toBeCloseTo(
        (TOTAL / (QUANTITY * BASE_FACTOR)) * Number(ing!.conversionFactor),
        2,
      );
    });

    it('costea con el TOTAL de la línea, no quantity×unitPrice (descuento/IVA por línea)', async () => {
      // Línea con descuento: total $9.000 ≠ quantity×unitPrice ($10.000). El FIFO
      // debe costear lo que se PAGÓ ($9.000), no la reconstrucción quantity×precio.
      await request
        .post(`/invoices/${draftInvoiceId}/confirm`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          supplierNit: '900123456-1',
          supplierName: 'Proveedor Test Invoice',
          invoiceNumber: 'F-DESC',
          total: 9000,
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId,
              descriptionRaw: 'Harina con descuento',
              quantity: 10,
              unit: 'kg',
              unitPrice: 1000,
              total: 9000, // 10% dto: ≠ 10 × 1000
            },
          ],
        })
        .expect(201);

      const m = await prisma.inventoryMovement.findFirst({
        where: { entityType: 'INGREDIENT', ingredientId, type: 'PURCHASE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(Number(m!.delta)).toBe(10000); // 10 kg × 1000 g/kg
      // costo por g = total / gramos = 9000/10000 = $0,9/g  (NO 10000/10000 = $1,0)
      expect(Number(m!.unitCost)).toBeCloseTo(0.9, 4);
      const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
      expect(Number(ing!.lastUnitCost)).toBeCloseTo(900, 2); // $0,9/g × 1000 = $900/kg
    });

    it('rechaza confirmar una invoice ya confirmada', async () => {
      // Primero confirmar
      await request
        .post(`/invoices/${draftInvoiceId}/confirm`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          supplierNit: '900123456-1',
          supplierName: 'Proveedor Test Invoice',
          total: 50000,
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId,
              descriptionRaw: 'Harina Test',
              quantity: 5,
              unit: 'kg',
              unitPrice: 10000,
              total: 50000,
            },
          ],
        })
        .expect(201);

      // Intentar confirmar de nuevo
      await request
        .post(`/invoices/${draftInvoiceId}/confirm`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          supplierNit: '900123456-1',
          supplierName: 'Proveedor Test Invoice',
          total: 50000,
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId,
              descriptionRaw: 'Harina Test',
              quantity: 5,
              unit: 'kg',
              unitPrice: 10000,
              total: 50000,
            },
          ],
        })
        .expect(400);
    });

    it('rechaza cuando total no coincide con suma de items', async () => {
      await request
        .post(`/invoices/${draftInvoiceId}/confirm`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          supplierNit: '900123456-1',
          supplierName: 'Proveedor Test Invoice',
          total: 99999, // no coincide con 5 × 10000 = 50000
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId,
              descriptionRaw: 'Harina Test',
              quantity: 5,
              unit: 'kg',
              unitPrice: 10000,
              total: 50000,
            },
          ],
        })
        .expect(400);
    });

    it('rechaza cuando ingredientId no existe', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request
        .post(`/invoices/${draftInvoiceId}/confirm`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          supplierNit: '900123456-1',
          supplierName: 'Proveedor Test Invoice',
          total: 50000,
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId: fakeId,
              descriptionRaw: 'Fantasma',
              quantity: 5,
              unit: 'kg',
              unitPrice: 10000,
              total: 50000,
            },
          ],
        })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // from-clone: clonar invoice CONFIRMED como nuevo draft
  // ---------------------------------------------------------------------------
  describe('POST /invoices/from-clone', () => {
    let confirmedInvoiceId: string;

    beforeAll(async () => {
      // Crear y confirmar una invoice
      const draft = await prisma.invoice.create({
        data: {
          status: 'PENDING_REVIEW',
          aiModelUsed: 'test-mock-clone',
          aiExtractionJson: { items: [], warnings: [] },
          uploadedById: duenoUserId,
        },
      });

      const res = await request
        .post(`/invoices/${draft.id}/confirm`)
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({
          supplierNit: '900123456-1',
          supplierName: 'Proveedor Test Invoice',
          total: 20000,
          items: [
            {
              entityType: 'INGREDIENT',
              ingredientId,
              descriptionRaw: 'Harina para clonar',
              quantity: 2,
              unit: 'kg',
              unitPrice: 10000,
              total: 20000,
            },
          ],
        })
        .expect(201);

      confirmedInvoiceId = res.body.id as string;
    });

    it('crea un draft PENDING_REVIEW clonando los items de la CONFIRMED', async () => {
      const res = await request
        .post('/invoices/from-clone')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ sourceInvoiceId: confirmedInvoiceId })
        .expect(201);

      const { invoice, extraction } = res.body;
      expect(invoice.status).toBe('PENDING_REVIEW');
      expect(extraction.items.length).toBeGreaterThanOrEqual(1);
      expect(extraction.warnings[0]).toMatch(/Clonado de factura/);
    });

    it('rechaza clonar una invoice que no está CONFIRMED', async () => {
      const pendingDraft = await prisma.invoice.create({
        data: {
          status: 'PENDING_REVIEW',
          aiModelUsed: 'test',
          aiExtractionJson: { items: [], warnings: [] },
          uploadedById: duenoUserId,
        },
      });

      await request
        .post('/invoices/from-clone')
        .set('Authorization', `Bearer ${duenoToken}`)
        .send({ sourceInvoiceId: pendingDraft.id })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /invoices
  // ---------------------------------------------------------------------------
  describe('GET /invoices', () => {
    it('lista las invoices sin auth → 401', async () => {
      await request.get('/invoices').expect(401);
    });

    it('lista las invoices con auth de admin', async () => {
      const res = await request
        .get('/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
