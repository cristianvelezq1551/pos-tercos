/**
 * Los dos contadores de inventario del dashboard (§M1, auditoría 2026-08-26).
 *
 * Existen por una razón operativa distinta cada uno y NO son intercambiables:
 *  - `lowStockCount`  = lo que está bajo el mínimo → hay que comprar.
 *  - `negativeStockCount` = deuda de inventario (stock < 0) → falta subir una
 *    factura o registrar una producción.
 *
 * Hasta esta suite ninguno tenía prueba, y las reglas de qué entra en cada uno
 * viven repartidas entre dos servicios (`SalesReportsService` e
 * `InventoryService`). Este archivo las FIJA antes de tocar el rendimiento:
 * el objetivo del cambio es que el dashboard agregue `inventory_movements` una
 * sola vez en vez de dos, y estos números tienen que salir idénticos.
 */
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { InventoryService } from '../src/inventory/inventory.service';

interface DashboardDto {
  lowStockCount: number;
  negativeStockCount: number;
}

describe('Contadores de inventario del dashboard E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Insumo con umbral y stock exactos. `delta` puede ser negativo (deuda). */
  const makeIngredient = async (opts: {
    name: string;
    threshold: number;
    delta: number;
    blocks?: boolean;
    active?: boolean;
  }): Promise<string> => {
    const res = await request
      .post('/ingredients')
      .set(auth())
      .send({
        name: opts.name,
        unitPurchase: 'bolsa',
        unitRecipe: 'unidad',
        conversionFactor: 1,
        thresholdMin: opts.threshold,
      })
      .expect(201);
    const id = res.body.id as string;
    if (opts.delta !== 0) {
      // El stock negativo no se puede crear por el endpoint (lo rechaza), así
      // que el movimiento va directo: acá se está fabricando el ESTADO a medir,
      // no probando el camino de escritura.
      await prisma.inventoryMovement.create({
        data: {
          entityType: 'INGREDIENT',
          ingredientId: id,
          delta: opts.delta,
          type: opts.delta > 0 ? 'INITIAL' : 'MANUAL_ADJUSTMENT',
          unitCost: opts.delta > 0 ? 100 : null,
        },
      });
    }
    const patch: Record<string, unknown> = {};
    if (opts.blocks === false) patch.blocksAvailability = false;
    if (opts.active === false) patch.isActive = false;
    if (Object.keys(patch).length > 0) {
      await prisma.ingredient.update({ where: { id }, data: patch });
    }
    return id;
  };

  const makeSubproduct = async (opts: {
    name: string;
    threshold: number;
    delta: number;
  }): Promise<string> => {
    const sub = await prisma.subproduct.create({
      data: {
        name: opts.name,
        unit: 'unidad',
        yield: 1,
        thresholdMin: opts.threshold,
      },
    });
    if (opts.delta !== 0) {
      await prisma.inventoryMovement.create({
        data: {
          entityType: 'SUBPRODUCT',
          subproductId: sub.id,
          delta: opts.delta,
          type: opts.delta > 0 ? 'INITIAL' : 'MANUAL_ADJUSTMENT',
          unitCost: null,
        },
      });
    }
    return sub.id;
  };

  const dashboard = async (): Promise<DashboardDto> =>
    (await request.get('/reports/dashboard').set(auth()).expect(200)).body as DashboardDto;

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-dash@test.local',
        fullName: 'Dueño Dash',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-dash@test.local');
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('con inventario limpio los dos contadores arrancan en cero', async () => {
    const d = await dashboard();
    expect(d.lowStockCount).toBe(0);
    expect(d.negativeStockCount).toBe(0);
  });

  it('cuenta bajo mínimo e insumos en deuda, cada uno con SUS reglas', async () => {
    // --- bajo el mínimo (cuenta en lowStock) ---
    await makeIngredient({ name: 'DASH bajo', threshold: 10, delta: 5 });

    // --- sobrado (no cuenta en ninguno) ---
    await makeIngredient({ name: 'DASH sobrado', threshold: 10, delta: 50 });

    // --- en deuda y bloqueante (cuenta en negative, NO en lowStock: el
    //     contador de bajo mínimo exige umbral > 0) ---
    await makeIngredient({ name: 'DASH deuda', threshold: 0, delta: -8 });

    // --- consumible en deuda: las servilletas en negativo son esperables y
    //     taparían la señal que importa → NO cuenta en negative ---
    await makeIngredient({ name: 'DASH servilleta', threshold: 0, delta: -3, blocks: false });

    // --- inactiva bajo mínimo: no se compra lo que se dio de baja ---
    await makeIngredient({ name: 'DASH inactiva', threshold: 10, delta: 1, active: false });

    // --- producto de reventa bajo mínimo (cuenta en lowStock) ---
    const prod = await request
      .post('/products')
      .set(auth())
      .send({
        name: 'DASH gaseosa',
        basePrice: 4000,
        category: 'Bebidas',
        directResale: true,
        unitPurchase: 'caja',
        unitStock: 'unidad',
        conversionFactor: 12,
        thresholdMin: 5,
      })
      .expect(201);
    await prisma.inventoryMovement.create({
      data: {
        entityType: 'PRODUCT',
        productId: prod.body.id as string,
        delta: 2,
        type: 'INITIAL',
        unitCost: 1000,
      },
    });

    // --- subproducto bajo mínimo: NO entra en lowStock (no se compra, se
    //     produce), pero su deuda SÍ es deuda de inventario ---
    await makeSubproduct({ name: 'DASH salsa', threshold: 10, delta: 1 });
    await makeSubproduct({ name: 'DASH masa', threshold: 0, delta: -4 });

    const d = await dashboard();
    // bajo mínimo: insumo "bajo" + producto "gaseosa". Ni la inactiva, ni el
    // subproducto, ni la que tiene umbral 0.
    expect(d.lowStockCount).toBe(2);
    // deuda: insumo "deuda" + subproducto "masa". La servilletas no (consumible).
    expect(d.negativeStockCount).toBe(2);
  });

  it('agrega inventory_movements UNA sola vez, no una por contador', async () => {
    // El arreglo en sí. `getCurrentStockMap` suma la tabla ENTERA —insert-only,
    // una fila por cada consumo de cada venta— y antes se corría dos veces por
    // carga: una en el contador de bajo mínimo y otra en el de deuda, para
    // calcular casi lo mismo. Sin este guard, cualquiera puede volver a pedirla
    // por su lado y nadie se entera hasta que la tabla pese.
    const inventory = app.get(InventoryService);
    const spy = jest.spyOn(inventory, 'getCurrentStockMap');
    try {
      await dashboard();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('reponer el stock baja los dos contadores', async () => {
    const id = await makeIngredient({ name: 'DASH repuesta', threshold: 20, delta: -5 });
    const antes = await dashboard();

    await prisma.inventoryMovement.create({
      data: {
        entityType: 'INGREDIENT',
        ingredientId: id,
        delta: 100,
        type: 'PURCHASE',
        unitCost: 90,
      },
    });

    const despues = await dashboard();
    // Sale de la deuda Y del bajo mínimo (pasa de −5 a 95, con mínimo 20).
    expect(despues.negativeStockCount).toBe(antes.negativeStockCount - 1);
    expect(despues.lowStockCount).toBe(antes.lowStockCount - 1);
  });
});
