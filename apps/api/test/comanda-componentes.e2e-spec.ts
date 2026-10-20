/**
 * La comanda dice QUÉ lleva cada combo (PLAN-COMBO-CON-VARIANTE.md, entrega 2).
 *
 * Decisión del dueño (2026-10-20): debajo de cada combo, una línea por
 * componente con su variante —"2x Papas TERCOS Pollo y Miel ahumada"—, en
 * TODOS los combos y en todos los papeles de cocina: la comanda normal, la de
 * anulación, las adiciones de una cuenta abierta y la de una cortesía. El
 * recibo del cliente NO cambia: lleva el nombre y el precio del combo.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

const APPROVAL_PIN = '271828';
const LINEA_POLLO = '- 2x Papas CC Pollo y Miel';
const LINEA_SMASH = '- 2x Smash CC';
const LINEA_COCA = '- 1x Coca CC';

describe('La comanda lista los componentes del combo E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  let papasId: string;
  let comboPolloId: string;
  let comboSmashId: string;
  let smashId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const papel = (base64: string): string => Buffer.from(base64, 'base64').toString('latin1');

  const crearVenta = (items: object[], extra: object = {}) =>
    request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items, ...extra })
      .expect(201);

  const cobrar = (saleId: string, total: number) =>
    request.post(`/sales/${saleId}/confirm-payment`).set(auth()).send({ method: 'CASH', amountReceived: total }).expect(201);

  const comanda = async (saleId: string, query = ''): Promise<string> => {
    const res = await request.get(`/sales/${saleId}/comanda-escpos${query}`).set(auth()).expect(200);
    return papel(res.body.escposBase64 as string);
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    await prisma.user.create({
      data: {
        email: 'dueno-comanda-comp@test.local',
        fullName: 'Dueño Comanda',
        role: 'DUENO',
        passwordHash: await bcrypt.hash('dev12345', 10),
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-comanda-comp@test.local');
    await request
      .post('/approvals/pin')
      .set(auth())
      .send({ pin: APPROVAL_PIN, password: 'dev12345' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`PIN: ${res.status} ${JSON.stringify(res.body)}`);
      });

    const papaId = (
      await request
        .post('/ingredients')
        .set(auth())
        .send({ name: 'Papa CC', unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000 })
        .expect(201)
    ).body.id as string;
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ type: 'INITIAL', entityType: 'INGREDIENT', ingredientId: papaId, delta: 100_000, unitCost: 10 })
      .expect(201);

    const papas = await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Test',
        name: 'Papas CC',
        basePrice: 25_000,
        directResale: false,
        isCombo: false,
        modifiersEnabled: false,
        sizes: [{ name: 'Pollo y Miel', priceModifier: 0, sortOrder: 0 }],
      })
      .expect(201);
    papasId = papas.body.id as string;
    const polloSizeId = (papas.body.sizes as Array<{ id: string }>)[0].id;
    await request
      .put(`/products/${papasId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: papaId, quantityNeta: 200 }] })
      .expect(200);

    smashId = (
      await request
        .post('/products')
        .set(auth())
        .send({ category: 'Test', name: 'Smash CC', basePrice: 29_000, directResale: false, isCombo: false, modifiersEnabled: false })
        .expect(201)
    ).body.id as string;
    await request
      .put(`/products/${smashId}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: papaId, quantityNeta: 50 }] })
      .expect(200);

    const cocaId = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Test',
          name: 'Coca CC',
          basePrice: 5000,
          directResale: true,
          unitPurchase: 'caja',
          unitStock: 'unidad',
          conversionFactor: 24,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ type: 'INITIAL', entityType: 'PRODUCT', productId: cocaId, delta: 100, unitCost: 1000 })
      .expect(201);

    const combo = async (name: string, precio: number, comboComponents: object[]) =>
      (
        await request
          .post('/products')
          .set(auth())
          .send({ category: 'Test', name, basePrice: precio, isCombo: true, comboPrice: precio, modifiersEnabled: false, comboComponents })
          .expect(201)
      ).body.id as string;
    comboPolloId = await combo('2 Papas Pollo CC', 40_000, [{ productId: papasId, sizeId: polloSizeId, quantity: 2 }]);
    // Como el Combo Double Smash de prod: sin variantes.
    comboSmashId = await combo('Combo Smash CC', 60_000, [
      { productId: smashId, quantity: 2 },
      { productId: cocaId, quantity: 1 },
    ]);

    await request.post('/shifts/open').set(auth()).send({ openingCash: 0 }).expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('la comanda de un combo con variante dice qué variante armar', async () => {
    const venta = await crearVenta([{ productId: comboPolloId, quantity: 1 }]);
    const texto = await comanda(venta.body.id as string, '?variant=kitchen');
    expect(texto).toContain('1x 2 Papas Pollo CC');
    expect(texto).toContain(LINEA_POLLO);
  });

  it('un combo SIN variantes también lista lo que lleva (todos los combos)', async () => {
    const venta = await crearVenta([{ productId: comboSmashId, quantity: 1 }]);
    const texto = await comanda(venta.body.id as string);
    expect(texto).toContain(LINEA_SMASH);
    expect(texto).toContain(LINEA_COCA);
  });

  it('un plato suelto (no combo) no gana líneas de componentes', async () => {
    const venta = await crearVenta([{ productId: smashId, quantity: 1 }]);
    const texto = await comanda(venta.body.id as string);
    expect(texto).toContain('1x Smash CC');
    expect(texto).not.toContain('   - ');
  });

  it('el ticket de ANULACIÓN también dice qué llevaba el combo', async () => {
    const venta = await crearVenta([{ productId: comboPolloId, quantity: 1 }]);
    await cobrar(venta.body.id as string, venta.body.total as number);
    await request
      .post(`/sales/${venta.body.id}/void`)
      .set(auth())
      .set('X-Approval-Pin', APPROVAL_PIN)
      .send({ reason: 'Prueba de comanda de anulación' })
      .expect((res) => {
        if (res.status >= 300) throw new Error(`void: ${res.status} ${JSON.stringify(res.body)}`);
      });
    const texto = await comanda(venta.body.id as string, '?cancel=true');
    expect(texto).toContain('ANULAR');
    expect(texto).toContain(LINEA_POLLO);
  });

  it('las adiciones de una cuenta abierta listan los componentes de lo NUEVO', async () => {
    const cuenta = await crearVenta([{ productId: comboSmashId, quantity: 1 }], {
      openTab: true,
      customerName: 'Mesa comanda',
    });
    const primera = await request.post(`/sales/${cuenta.body.id}/send-to-kitchen`).set(auth()).expect(200);
    expect(papel(primera.body.kitchen.escposBase64 as string)).toContain(LINEA_SMASH);

    await request
      .patch(`/sales/${cuenta.body.id}/items`)
      .set(auth())
      .send({ items: [{ productId: comboSmashId, quantity: 1 }, { productId: comboPolloId, quantity: 1 }] })
      .expect(200);
    const adicion = await request.post(`/sales/${cuenta.body.id}/send-to-kitchen`).set(auth()).expect(200);
    const texto = papel(adicion.body.kitchen.escposBase64 as string);
    expect(texto).toContain('ADICI');
    expect(texto).toContain(LINEA_POLLO);
    // Lo que ya se mandó no se repite en la adición.
    expect(texto).not.toContain(LINEA_SMASH);
  });

  it('la comanda de una CORTESÍA lista los componentes; el recibo de la cortesía no', async () => {
    const creada = await request
      .post('/cortesias')
      .set(auth())
      .send({ productId: comboPolloId, quantity: 1, reason: 'Prueba de papeles del combo' })
      .expect(201);
    const papeles = await request.post('/cortesias/print').set(auth()).send({ ids: [creada.body.id] }).expect(200);
    expect(papel(papeles.body.comandaBase64 as string)).toContain(LINEA_POLLO);
    expect(papel(papeles.body.receiptBase64 as string)).not.toContain(LINEA_POLLO);
  });

  it('el RECIBO del cliente no cambia: el combo con su precio, sin componentes', async () => {
    const venta = await crearVenta([{ productId: comboPolloId, quantity: 1 }]);
    await cobrar(venta.body.id as string, venta.body.total as number);
    const res = await request.get(`/sales/${venta.body.id}/escpos`).set(auth()).expect(200);
    const texto = papel(res.body.escposBase64 as string);
    expect(texto).toContain('2 Papas Pollo CC');
    expect(texto).not.toContain(LINEA_POLLO);
  });
});
