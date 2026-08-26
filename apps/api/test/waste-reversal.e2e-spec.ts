/**
 * waste-reversal.e2e-spec.ts
 *
 * Anulación de merma. `inventory_movements` es insert-only, así que una merma
 * mal registrada (el clásico "10 kg" en vez de "1 kg") solo se corregía con un
 * ajuste manual: devolvía la CANTIDAD, pero el costo seguía restando del neto
 * del P&G para siempre, sin camino de corrección.
 *
 * Estos tests verifican que la reversa devuelve las unidades con su base de
 * costo REAL y que el estado financiero refleja la pérdida verdadera.
 */

import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { hoyLocal } from './helpers/local-day';

describe('Anulación de merma E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;

  let duenoToken: string;
  let ingredientId: string;
  let cogs: CogsService;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Costo de merma que el P&G resta del neto, en la ventana de hoy. */
  const wasteCostToday = async (): Promise<number> => {
    // El ledger se cachea 60s a propósito (un reporte de COGS tolera ese
    // staleness). Acá medimos la LÓGICA, no la caché.
    cogs.invalidateLedgerCache();
    const today = hoyLocal();
    const res = await request
      .get(`/reports/cogs/pnl?from=${today}&to=${today}`)
      .set(auth(duenoToken))
      .expect(200);
    return (res.body as { wasteCost: number }).wasteCost;
  };

  const stockOf = async (): Promise<number> => {
    const res = await request
      .get(`/inventory/stock/ingredient/${ingredientId}`)
      .set(auth(duenoToken))
      .expect(200);
    return (res.body as { currentStock: number }).currentStock;
  };

  /** Registra una merma y devuelve el id del movimiento. */
  const registerWaste = async (qty: number): Promise<string> => {
    const res = await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId,
        delta: -qty,
        type: 'WASTE',
        notes: 'Merma de prueba',
      })
      .expect(201);
    return (res.body as { id: string }).id;
  };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    cogs = app.get(CogsService);
    await cleanDb(prisma);

    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-merma@test.local',
        fullName: 'Dueño Merma',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    duenoToken = await loginAs(request, 'dueno-merma@test.local');

    const ing = await request
      .post('/ingredients')
      .set(auth(duenoToken))
      .send({
        name: 'Carne Merma Test',
        unitPurchase: 'kg',
        unitRecipe: 'g',
        conversionFactor: 1000,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    ingredientId = (ing.body as { id: string }).id;

    // Stock inicial valorizado: 10.000 g a $20/g = $200.000.
    await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId,
        delta: 10_000,
        type: 'INITIAL',
        unitCost: 20,
        notes: 'Carga inicial',
      })
      .expect(201);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  it('anular la merma entera devuelve el stock y borra la pérdida del P&G', async () => {
    const stockAntes = await stockOf();
    const wasteId = await registerWaste(1_000); // 1.000 g × $20 = $20.000

    expect(await wasteCostToday()).toBe(20_000);
    expect(await stockOf()).toBe(stockAntes - 1_000);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Se registró por error, no se tiró nada' })
      .expect(201);

    // La pérdida desaparece del estado financiero y el stock vuelve entero.
    expect(await wasteCostToday()).toBe(0);
    expect(await stockOf()).toBe(stockAntes);
  });

  it('anular PARCIALMENTE deja en el P&G solo lo que de verdad se tiró', async () => {
    const stockAntes = await stockOf();
    // El cocinero teclea 10.000 g cuando en realidad tiró 1.000.
    const wasteId = await registerWaste(10_000);
    expect(await wasteCostToday()).toBe(200_000);

    // El dueño devuelve los 9.000 g que nunca se tiraron.
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Dedo pesado: fue 1 kg, no 10', quantity: 9_000 })
      .expect(201);

    // Pérdida real: 1.000 g × $20 = $20.000 (no $200.000).
    expect(await wasteCostToday()).toBe(20_000);
    expect(await stockOf()).toBe(stockAntes - 1_000);
  });

  it('las reversas parciales se acumulan y nunca devuelven más de lo mermado', async () => {
    const wasteId = await registerWaste(500);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Primera devolución parcial', quantity: 300 })
      .expect(201);

    // Quedan 200 sin anular: pedir 300 más debe fallar.
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Se pasa de lo mermado', quantity: 300 })
      .expect(400);

    // 200 sí entra, y deja la merma completamente anulada.
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Resto de la devolución', quantity: 200 })
      .expect(201);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Ya no queda nada por anular' })
      .expect(400);
  });

  /**
   * El caso real: el dueño hace doble clic en "Anular" y salen dos requests a
   * la vez. Sin la tx Serializable las dos leían "0 devuelto", las dos pasaban
   * el tope y el insumo volvía al DOBLE de lo mermado — un fantasma permanente,
   * porque `inventory_movements` es insert-only y no se puede borrar.
   */
  it('dos anulaciones simultáneas no devuelven más de lo mermado', async () => {
    const stockAntes = await stockOf();
    // Relativo: tests anteriores dejan mermas del día sin anular a propósito.
    const wasteCostAntes = await wasteCostToday();
    const wasteId = await registerWaste(1_000);

    const anular = () =>
      request
        .post(`/inventory/movements/${wasteId}/reverse-waste`)
        .set(auth(duenoToken))
        .send({ reason: 'Doble clic del dueño en el botón Anular' });

    // Varias en paralelo: con una sola pareja la carrera puede no darse nunca
    // porque las dos requests se atienden en fila.
    const res = await Promise.all(Array.from({ length: 6 }, anular));

    // Exactamente una entra; el resto rebota (400: ya no queda por anular).
    expect(res.filter((r) => r.status === 201).length).toBe(1);
    expect(res.filter((r) => r.status === 400).length).toBe(res.length - 1);

    // Y lo que importa: el stock vuelve EXACTO, no al doble.
    expect(await stockOf()).toBe(stockAntes);
    expect(await wasteCostToday()).toBe(wasteCostAntes);
  });

  it('no se puede anular un movimiento que no es una merma', async () => {
    const compra = await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId,
        delta: 100,
        type: 'MANUAL_ADJUSTMENT',
        unitCost: 20,
        notes: 'Ajuste cualquiera',
      })
      .expect(201);

    await request
      .post(`/inventory/movements/${(compra.body as { id: string }).id}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Esto no es una merma' })
      .expect(400);
  });

  it('el cajero no puede anular mermas (es acción de admin)', async () => {
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'cajero-merma@test.local',
        fullName: 'Cajero Merma',
        role: 'CAJERO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    const cajeroToken = await loginAs(request, 'cajero-merma@test.local');
    const wasteId = await registerWaste(100);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(cajeroToken))
      .send({ reason: 'No debería poder' })
      .expect(403);
  });

  it('la reversa queda en la bitácora con su motivo', async () => {
    const wasteId = await registerWaste(250);
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'Motivo auditable de la anulación' })
      .expect(201);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'INVENTORY_MOVEMENT_WASTE_REVERSED', entityId: wasteId },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log!.afterJson)).toContain('Motivo auditable');
  });

  // ==================================================================
  // "Uso y mermas" tiene que contar la MISMA pérdida que el P&G.
  //
  // Auditoría 2026-07-25: /reports/inventory-usage no conocía las reversas.
  // Una merma anulada seguía figurando entera (con su % y su plata perdida)
  // mientras el P&G ya la había neteado — dos reportes en desacuerdo sobre la
  // misma plata. Peor: la reversa entraba como ajuste POSITIVO y el neto
  // cancelaba faltantes reales de conteo físico del mismo período.
  // ==================================================================

  /** Insumo propio con `lastUnitCost` para que "Uso y mermas" pueda valorizar. */
  const freshValuedIngredient = async (name: string): Promise<string> => {
    const res = await request
      .post('/ingredients')
      .set(auth(duenoToken))
      .send({
        name,
        unitPurchase: 'kg',
        unitRecipe: 'g',
        conversionFactor: 1000,
        thresholdMin: 0,
        isActive: true,
      })
      .expect(201);
    const id = (res.body as { id: string }).id;
    // $20.000/kg ÷ 1000 g = $20/g — el mismo costo del stock inicial.
    await prisma.ingredient.update({
      where: { id },
      data: { lastUnitCost: 20_000, lastUnitCostDate: new Date() },
    });
    await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId: id,
        delta: 10_000,
        type: 'INITIAL',
        unitCost: 20,
        notes: 'Carga inicial',
      })
      .expect(201);
    return id;
  };

  const usageRowOf = async (
    entityId: string,
  ): Promise<{ waste: number; adjustments: number; wastePct: number | null; wasteCost: number | null }> => {
    const today = hoyLocal();
    const res = await request
      .get(`/reports/inventory-usage?from=${today}&to=${today}`)
      .set(auth(duenoToken))
      .expect(200);
    const rows = (
      res.body as {
        rows: Array<{
          entityId: string;
          waste: number;
          adjustments: number;
          wastePct: number | null;
          wasteCost: number | null;
        }>;
      }
    ).rows;
    return (
      rows.find((r) => r.entityId === entityId) ?? {
        waste: 0,
        adjustments: 0,
        wastePct: null,
        wasteCost: 0,
      }
    );
  };

  const registerWasteOn = async (entityId: string, qty: number): Promise<string> => {
    const res = await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId: entityId,
        delta: -qty,
        type: 'WASTE',
        notes: 'Merma de prueba',
      })
      .expect(201);
    return (res.body as { id: string }).id;
  };

  it('"Uso y mermas" borra la pérdida al anular, igual que el P&G', async () => {
    const id = await freshValuedIngredient('Carne Uso-y-Mermas');
    const wasteId = await registerWasteOn(id, 1_000); // 1.000 g × $20 = $20.000

    const antes = await usageRowOf(id);
    expect(antes.waste).toBe(1_000);
    expect(antes.wasteCost).toBe(20_000);

    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'No se tiró nada' })
      .expect(201);

    // La reversa NO es un ajuste de inventario: netea la merma original.
    const despues = await usageRowOf(id);
    expect(despues.waste).toBe(0);
    expect(despues.wasteCost).toBe(0);
    // Sin consumo ni merma no hay porcentaje que calcular (antes daba 100%).
    expect(despues.wastePct).toBeNull();
    expect(despues.adjustments).toBe(0);
  });

  it('anular una merma NO tapa un faltante de conteo físico del mismo período', async () => {
    const id = await freshValuedIngredient('Carne Faltante-Tapado');
    const wasteId = await registerWasteOn(id, 1_000);
    await request
      .post(`/inventory/movements/${wasteId}/reverse-waste`)
      .set(auth(duenoToken))
      .send({ reason: 'La merma se registró por error' })
      .expect(201);

    // Faltante real: el conteo físico encuentra 500 g menos de los que dice el libro.
    await request
      .post('/inventory/movements')
      .set(auth(duenoToken))
      .send({
        entityType: 'INGREDIENT',
        ingredientId: id,
        delta: -500,
        type: 'MANUAL_ADJUSTMENT',
        notes: 'Faltante de conteo físico',
      })
      .expect(201);

    const row = await usageRowOf(id);
    expect(row.waste).toBe(0);
    // El faltante sobrevive: −500 (antes el +1.000 de la reversa lo dejaba en +500).
    expect(row.adjustments).toBe(-500);
    // Y su plata se reporta: 500 g × $20 = $10.000.
    expect(row.wasteCost).toBe(10_000);
  });

  it('la anulación de una CORTESÍA no cuenta como ajuste de inventario', async () => {
    const id = await freshValuedIngredient('Carne Cortesia-Reversa');
    // El consumo de una cortesía y su reversa se contabilizan en el estado
    // financiero, no acá: los dos tienen que quedar fuera de "Uso y mermas".
    await prisma.inventoryMovement.create({
      data: {
        entityType: 'INGREDIENT',
        ingredientId: id,
        delta: -200,
        type: 'MANUAL_ADJUSTMENT',
        sourceType: 'cortesia',
        sourceId: '00000000-0000-4000-8000-000000000001',
        notes: 'Cortesía',
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        entityType: 'INGREDIENT',
        ingredientId: id,
        delta: 200,
        type: 'MANUAL_ADJUSTMENT',
        sourceType: 'cortesia_reversal',
        sourceId: '00000000-0000-4000-8000-000000000001',
        notes: 'Cortesía anulada',
      },
    });

    const row = await usageRowOf(id);
    expect(row.adjustments).toBe(0);
    expect(row.waste).toBe(0);
  });

  // ==================================================================
  // Regresiones 2026-08: validación de movimientos manuales.
  //
  // Dos agujeros de la API pública (la UI ya forzaba el signo):
  //  1. Un MANUAL_ADJUSTMENT negativo podía hundir el stock bajo cero — el
  //     replay FIFO no deja deuda por ajustes, así que las unidades
  //     desaparecían en silencio y la valuación quedaba sobrestimada.
  //  2. Una "merma" con delta POSITIVO entraba al ledger como lote fantasma
  //     sin costo, y reverse-waste sobre esa fila fabricaba stock de nuevo.
  // ==================================================================
  describe('Validación de movimientos manuales', () => {
    /** Insumo limpio con stock 5 para probar el piso del ajuste. */
    let ajusteIngredientId: string;

    const newIngredient = async (name: string): Promise<string> => {
      const res = await request
        .post('/ingredients')
        .set(auth(duenoToken))
        .send({
          name,
          unitPurchase: 'kg',
          unitRecipe: 'g',
          conversionFactor: 1000,
          thresholdMin: 0,
          isActive: true,
        })
        .expect(201);
      return (res.body as { id: string }).id;
    };

    beforeAll(async () => {
      ajusteIngredientId = await newIngredient('Queso Ajuste-Negativo');
      await request
        .post('/inventory/movements')
        .set(auth(duenoToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId: ajusteIngredientId,
          delta: 5,
          type: 'INITIAL',
          unitCost: 100,
          notes: 'Carga inicial',
        })
        .expect(201);
    });

    // Bug: el ajuste bajo cero "desaparecía" unidades sin dejar deuda en el
    // ledger — la valuación quedaba sobrestimada para siempre.
    it('un ajuste manual negativo no puede dejar el stock bajo cero', async () => {
      const res = await request
        .post('/inventory/movements')
        .set(auth(duenoToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId: ajusteIngredientId,
          delta: -8, // hay 5
          type: 'MANUAL_ADJUSTMENT',
          notes: 'Faltante mayor al stock',
        })
        .expect(400);
      expect(String(res.body.message)).toMatch(/negativo/);
      expect(String(res.body.message)).toMatch(/merma/);

      // Un faltante que SÍ cabe en el stock entra normal…
      await request
        .post('/inventory/movements')
        .set(auth(duenoToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId: ajusteIngredientId,
          delta: -3,
          type: 'MANUAL_ADJUSTMENT',
          notes: 'Faltante de conteo',
        })
        .expect(201);

      // …y el stock queda exacto (5 − 3 = 2), nunca negativo.
      const stock = await request
        .get(`/inventory/stock/ingredient/${ajusteIngredientId}`)
        .set(auth(duenoToken))
        .expect(200);
      expect((stock.body as { currentStock: number }).currentStock).toBe(2);
    });

    // Bug: la merma positiva entraba como lote fantasma sin costo y
    // reverse-waste sobre esa fila fabricaba stock por segunda vez.
    it('una merma con delta positivo se rechaza', async () => {
      const res = await request
        .post('/inventory/movements')
        .set(auth(duenoToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId,
          delta: 10,
          type: 'WASTE',
          notes: 'Merma al revés',
        })
        .expect(400);
      expect(String(res.body.message)).toMatch(/negativa/);
    });

    // Bug hermano: un INITIAL negativo invertía el signo del arranque del ledger.
    it('una carga inicial negativa se rechaza', async () => {
      const freshId = await newIngredient('Queso Inicial-Negativo');
      const res = await request
        .post('/inventory/movements')
        .set(auth(duenoToken))
        .send({
          entityType: 'INGREDIENT',
          ingredientId: freshId,
          delta: -5,
          type: 'INITIAL',
          notes: 'Inicial al revés',
        })
        .expect(400);
      expect(String(res.body.message)).toMatch(/positiva/);
    });
  });
});
