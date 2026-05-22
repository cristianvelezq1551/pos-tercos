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
import supertest = require('supertest');
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Invoices E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: supertest.SuperTest<supertest.Test>;

  let duenoToken: string;
  let adminToken: string;
  let duenoUserId: string;
  let ingredientId: string;
  let supplierId: string;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const hash = await bcrypt.hash('dev12345', 10);

    const [dueno, admin] = await Promise.all([
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

    supplierId = supplierRes.body.id as string;

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
