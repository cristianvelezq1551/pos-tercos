/**
 * E2E del combo con bebida a ELEGIR.
 *
 * El bug que cierra: un combo "2 Double Smash + 2 Pepsi" descontaba Pepsi
 * aunque el cliente se llevara Coca-Cola, porque la elección no existía en el
 * modelo. Acá se verifica que el inventario descuente lo que REALMENTE salió.
 *
 * Incluye la regresión que más importa: un combo SIN grupos tiene que seguir
 * comportándose exactamente como antes de que esto existiera.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';

describe('Combo con opciones a elegir E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let cajeroToken: string;

  let panId: string;
  let carneId: string;
  let smashId: string;
  let pepsiId: string;
  let cocaId: string;
  let jugoId: string;
  let comboId: string;
  let grupoBebidaId: string;
  let comboFijoId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function movementsFor(saleId: string) {
    const rows = await prisma.inventoryMovement.findMany({
      where: { sourceType: 'sale', sourceId: saleId },
    });
    return rows.map((m) => ({
      entityType: m.entityType,
      entityId: m.ingredientId ?? m.productId ?? m.subproductId,
      delta: Number(m.delta),
    }));
  }

  /** Suma neta descontada de un producto de reventa a lo largo de TODA la venta. */
  function deltaDe(movements: Awaited<ReturnType<typeof movementsFor>>, productId: string): number {
    return movements
      .filter((m) => m.entityType === 'PRODUCT' && m.entityId === productId)
      .reduce((acc, m) => acc + m.delta, 0);
  }

  /** Sin `async`: devuelve el encadenable de supertest para poder `.expect(...)`. */
  function crearVenta(items: object[]) {
    return request
      .post('/sales')
      .set(auth(cajeroToken))
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items });
  }

  async function cobrar(saleId: string, total: number): Promise<void> {
    await request
      .post(`/sales/${saleId}/confirm-payment`)
      .set(auth(cajeroToken))
      .send({ method: 'CASH', amountReceived: Math.max(total, 1) })
      .expect(201);
  }

  async function venderCombo(choices: object[], quantity = 1) {
    const res = await crearVenta([{ productId: comboId, quantity, choices }]).expect(201);
    await cobrar(res.body.id, res.body.total);
    return res.body;
  }

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.createMany({
      data: [
        {
          email: 'dueno-eleccion@test.local',
          fullName: 'Dueño Elección',
          role: 'DUENO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
        {
          email: 'cajero-eleccion@test.local',
          fullName: 'Cajero Elección',
          role: 'CAJERO',
          passwordHash: hash,
          mustChangePwd: false,
          active: true,
        },
      ],
      skipDuplicates: true,
    });
    duenoToken = await loginAs(request, 'dueno-eleccion@test.local');
    cajeroToken = await loginAs(request, 'cajero-eleccion@test.local');

    const mkIngredient = async (body: object) => {
      const res = await request.post('/ingredients').set(auth(duenoToken)).send(body).expect(201);
      return res.body.id as string;
    };
    panId = await mkIngredient({
      name: 'Pan Elección',
      unitPurchase: 'paquete',
      unitRecipe: 'unit',
      conversionFactor: 10,
    });
    carneId = await mkIngredient({
      name: 'Carne Elección',
      unitPurchase: 'kg',
      unitRecipe: 'g',
      conversionFactor: 1000,
    });

    const mkProduct = async (body: object) => {
      const res = await request
        .post('/products')
        .set(auth(duenoToken))
        .send({ category: 'Test', ...body })
        .expect(201);
      return res.body.id as string;
    };
    const bebida = (name: string, basePrice: number) => ({
      name,
      basePrice,
      directResale: true,
      unitPurchase: 'caja',
      unitStock: 'unit',
      conversionFactor: 24,
      modifiersEnabled: false,
    });
    smashId = await mkProduct({
      name: 'Double Smash Elección',
      basePrice: 22000,
      directResale: false,
      isCombo: false,
      modifiersEnabled: false,
    });
    pepsiId = await mkProduct(bebida('Pepsi Elección', 5000));
    cocaId = await mkProduct(bebida('Coca-Cola Elección', 5000));
    jugoId = await mkProduct(bebida('Jugo Natural Elección', 8000));

    await request
      .put(`/products/${smashId}/recipe`)
      .set(auth(duenoToken))
      .send({
        edges: [
          { childType: 'ingredient', childId: panId, quantityNeta: 1 },
          { childType: 'ingredient', childId: carneId, quantityNeta: 150 },
        ],
      })
      .expect(200);

    // El combo real del dueño: 2 Double Smash fijos + 2 bebidas a elegir.
    const comboRes = await request
      .post('/products')
      .set(auth(duenoToken))
      .send({
        category: 'Test',
        name: 'Combo Doble Elección',
        basePrice: 60000,
        isCombo: true,
        comboPrice: 60000,
        modifiersEnabled: false,
        comboComponents: [{ productId: smashId, quantity: 2 }],
        choiceGroups: [
          {
            label: 'Bebida',
            quantity: 2,
            options: [
              { productId: pepsiId },
              { productId: cocaId },
              // El jugo cuesta más: el recargo es por UNIDAD elegida.
              { productId: jugoId, priceDelta: 3000 },
            ],
          },
        ],
      })
      .expect(201);
    comboId = comboRes.body.id as string;
    grupoBebidaId = comboRes.body.choiceGroups[0].id as string;

    // Control de regresión: un combo de componentes fijos, como todos los de hoy.
    comboFijoId = await mkProduct({
      name: 'Combo Fijo Elección',
      basePrice: 27000,
      isCombo: true,
      comboPrice: 27000,
      modifiersEnabled: false,
      comboComponents: [
        { productId: smashId, quantity: 1 },
        { productId: pepsiId, quantity: 1 },
      ],
    });

    const mkInitial = async (body: object) => {
      await request
        .post('/inventory/movements')
        .set(auth(duenoToken))
        .send({ type: 'INITIAL', ...body })
        .expect(201);
    };
    await mkInitial({ entityType: 'INGREDIENT', ingredientId: panId, delta: 500, unitCost: 500 });
    await mkInitial({ entityType: 'INGREDIENT', ingredientId: carneId, delta: 100000, unitCost: 30 });
    await mkInitial({ entityType: 'PRODUCT', productId: pepsiId, delta: 100, unitCost: 1500 });
    await mkInitial({ entityType: 'PRODUCT', productId: cocaId, delta: 100, unitCost: 1600 });
    await mkInitial({ entityType: 'PRODUCT', productId: jugoId, delta: 100, unitCost: 3000 });

    await request
      .post('/shifts/open')
      .set(auth(cajeroToken))
      .send({ openingCash: 50000 })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('descuenta la bebida ELEGIDA y no toca la otra', async () => {
    const sale = await venderCombo([
      { groupId: grupoBebidaId, productId: cocaId, quantity: 2 },
    ]);
    const movements = await movementsFor(sale.id);

    expect(deltaDe(movements, cocaId)).toBe(-2);
    expect(deltaDe(movements, pepsiId)).toBe(0);
    // Lo fijo se descuenta igual: 2 smash = 2 panes + 300 g de carne.
    expect(movements.find((m) => m.entityId === panId)?.delta).toBe(-2);
    expect(movements.find((m) => m.entityId === carneId)?.delta).toBe(-300);
  });

  it('permite MEZCLAR opciones dentro del grupo', async () => {
    const sale = await venderCombo([
      { groupId: grupoBebidaId, productId: cocaId, quantity: 1 },
      { groupId: grupoBebidaId, productId: pepsiId, quantity: 1 },
    ]);
    const movements = await movementsFor(sale.id);

    expect(deltaDe(movements, cocaId)).toBe(-1);
    expect(deltaDe(movements, pepsiId)).toBe(-1);
  });

  it('escala con la cantidad de la línea', async () => {
    const sale = await venderCombo(
      [{ groupId: grupoBebidaId, productId: pepsiId, quantity: 2 }],
      3,
    );
    const movements = await movementsFor(sale.id);

    // 3 combos × 2 pepsis = 6
    expect(deltaDe(movements, pepsiId)).toBe(-6);
  });

  it('congela lo elegido en la línea de la venta', async () => {
    const sale = await venderCombo([
      { groupId: grupoBebidaId, productId: cocaId, quantity: 2 },
    ]);
    const detalle = await request.get(`/sales/${sale.id}`).set(auth(cajeroToken)).expect(200);

    expect(detalle.body.items[0].choices).toEqual([
      expect.objectContaining({
        groupLabel: 'Bebida',
        productId: cocaId,
        productName: 'Coca-Cola Elección',
        quantity: 2,
      }),
    ]);
  });

  it('el recargo de una opción se cobra POR UNIDAD elegida', async () => {
    const sinRecargo = await crearVenta([
      { productId: comboId, quantity: 1, choices: [{ groupId: grupoBebidaId, productId: cocaId, quantity: 2 }] },
    ]).expect(201);
    expect(sinRecargo.body.total).toBe(60000);
    await cobrar(sinRecargo.body.id, sinRecargo.body.total);

    const conRecargo = await crearVenta([
      { productId: comboId, quantity: 1, choices: [{ groupId: grupoBebidaId, productId: jugoId, quantity: 2 }] },
    ]).expect(201);
    // Dos jugos = dos recargos de $3.000, no uno.
    expect(conRecargo.body.total).toBe(66000);
    await cobrar(conRecargo.body.id, conRecargo.body.total);
  });

  it('rechaza el combo SIN elegir en vez de descontar una bebida al azar', async () => {
    const res = await crearVenta([{ productId: comboId, quantity: 1 }]).expect(400);
    expect(String(res.body.message)).toMatch(/[Ee]lige/);
  });

  it('rechaza elegir de MENOS', async () => {
    await crearVenta([
      { productId: comboId, quantity: 1, choices: [{ groupId: grupoBebidaId, productId: cocaId, quantity: 1 }] },
    ]).expect(400);
  });

  it('rechaza elegir de MÁS', async () => {
    await crearVenta([
      { productId: comboId, quantity: 1, choices: [{ groupId: grupoBebidaId, productId: cocaId, quantity: 3 }] },
    ]).expect(400);
  });

  it('rechaza una opción que no pertenece al grupo', async () => {
    await crearVenta([
      {
        productId: comboId,
        quantity: 1,
        choices: [
          { groupId: grupoBebidaId, productId: cocaId, quantity: 1 },
          // El smash no es una bebida elegible.
          { groupId: grupoBebidaId, productId: smashId, quantity: 1 },
        ],
      },
    ]).expect(400);
  });

  it('rechaza elegir en un producto que no tiene grupos', async () => {
    await crearVenta([
      { productId: comboFijoId, quantity: 1, choices: [{ groupId: grupoBebidaId, productId: cocaId, quantity: 1 }] },
    ]).expect(400);
  });

  it('REGRESIÓN: un combo sin grupos descuenta exactamente como antes', async () => {
    const res = await crearVenta([{ productId: comboFijoId, quantity: 2 }]).expect(201);
    await cobrar(res.body.id, res.body.total);
    const movements = await movementsFor(res.body.id);

    expect(res.body.total).toBe(54000);
    expect(deltaDe(movements, pepsiId)).toBe(-2);
    expect(movements.find((m) => m.entityId === panId)?.delta).toBe(-2);
    expect(movements.find((m) => m.entityId === carneId)?.delta).toBe(-300);
    expect(res.body.items[0].choices ?? []).toEqual([]);
  });

  it('cambiar la bebida de un pedido cobrado ajusta el stock por la DIFERENCIA', async () => {
    const sale = await venderCombo([
      { groupId: grupoBebidaId, productId: pepsiId, quantity: 2 },
    ]);
    expect(deltaDe(await movementsFor(sale.id), pepsiId)).toBe(-2);

    await request
      .patch(`/sales/${sale.id}/items`)
      .set(auth(cajeroToken))
      .send({
        items: [
          {
            productId: comboId,
            quantity: 1,
            choices: [{ groupId: grupoBebidaId, productId: cocaId, quantity: 2 }],
          },
        ],
      })
      .expect(200);

    const movements = await movementsFor(sale.id);
    // La Pepsi vuelve al estante y sale la Coca: neto 0 y −2.
    expect(deltaDe(movements, pepsiId)).toBe(0);
    expect(deltaDe(movements, cocaId)).toBe(-2);
  });

  it('cambiar la bebida por una CON recargo cobra el recargo (la línea es nueva, no se congela)', async () => {
    // Hallazgo de la auditoría en QA (2026-09-16): la huella de línea ignoraba
    // la elección, así que 2 Pepsi → 2 Jugo "coincidía" con la línea cobrada y
    // conservaba los $60.000 con dos jugos adentro.
    const sale = await venderCombo([{ groupId: grupoBebidaId, productId: pepsiId, quantity: 2 }]);
    expect(sale.total).toBe(60000);
    const res = await request
      .patch(`/sales/${sale.id}/items`)
      .set(auth(cajeroToken))
      .send({ items: [{ productId: comboId, quantity: 1, choices: [{ groupId: grupoBebidaId, productId: jugoId, quantity: 2 }] }] })
      .expect(200);
    expect(res.body.total).toBe(66000);
    expect(res.body.items[0].choices[0]).toMatchObject({ productId: jugoId, quantity: 2, priceDelta: 3000 });
  });

  it('editar SIN cambiar la bebida conserva el precio cobrado (regla 2026-08-25 intacta)', async () => {
    const sale = await venderCombo([{ groupId: grupoBebidaId, productId: jugoId, quantity: 2 }]);
    expect(sale.total).toBe(66000);
    // Se le agrega una Coca suelta: el combo mantiene sus $66.000 congelados.
    const res = await request
      .patch(`/sales/${sale.id}/items`)
      .set(auth(cajeroToken))
      .send({
        items: [
          { productId: comboId, quantity: 1, choices: [{ groupId: grupoBebidaId, productId: jugoId, quantity: 2 }] },
          { productId: cocaId, quantity: 1 },
        ],
      })
      .expect(200);
    const combo = res.body.items.find((it: { productId: string }) => it.productId === comboId);
    expect(combo.unitPrice).toBe(66000);
    expect(res.body.total).toBe(66000 + 5000);
  });

  it('el pedido WEB público muestra la bebida elegida junto a las adiciones', async () => {
    // Hallazgo QA: el DTO público no exponía la elección — el cliente veía
    // "1x Combo" en su seguimiento y el link de WhatsApp no decía la bebida.
    const res = await request
      .post('/web/orders')
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'WEB_PICKUP',
        customerName: 'Cliente Elección',
        customerPhone: '+573001234599',
        items: [{ productId: comboId, quantity: 1, choices: [{ groupId: grupoBebidaId, productId: cocaId, quantity: 1 }, { groupId: grupoBebidaId, productId: jugoId, quantity: 1 }] }],
      })
      .expect(201);
    const mods: string[] = res.body.order.items[0].modifiers;
    expect(mods).toEqual(expect.arrayContaining(['Coca-Cola Elección', 'Jugo Natural Elección']));
    expect(res.body.order.total).toBe(63000);
  });

  it('los papeles de una CORTESÍA dicen qué bebida se regaló', async () => {
    // Hallazgo QA: el recibo y la comanda de la cortesía decían solo "1x Combo".
    const creada = await request
      .post('/cortesias')
      .set(auth(cajeroToken))
      .send({ productId: comboId, quantity: 1, reason: 'Auditoría: papeles', choices: [{ groupId: grupoBebidaId, productId: cocaId, quantity: 2 }] })
      .expect(201);
    const papeles = await request
      .post('/cortesias/print')
      .set(auth(cajeroToken))
      .send({ ids: [creada.body.id] })
      // Devuelve los papeles, no crea nada: 200.
      .expect(200);
    const recibo = Buffer.from(papeles.body.receiptBase64, 'base64').toString('latin1');
    const comanda = Buffer.from(papeles.body.comandaBase64, 'base64').toString('latin1');
    expect(recibo).toContain('2 Coca-Cola Elección');
    expect(comanda).toContain('2 Coca-Cola Elección');
  });

  it('una cortesía del combo descuenta la bebida elegida', async () => {
    const antes = await stockDe(cocaId);
    await request
      .post('/cortesias')
      .set(auth(cajeroToken))
      .send({
        productId: comboId,
        quantity: 1,
        reason: 'Cliente frecuente',
        choices: [{ groupId: grupoBebidaId, productId: cocaId, quantity: 2 }],
      })
      .expect(201);

    expect(await stockDe(cocaId)).toBe(antes - 2);
  });

  async function stockDe(productId: string): Promise<number> {
    const agg = await prisma.inventoryMovement.aggregate({
      where: { entityType: 'PRODUCT', productId },
      _sum: { delta: true },
    });
    return Number(agg._sum.delta ?? 0);
  }
});
