/**
 * PRUEBA EXHAUSTIVA CONTRA UN ESPEJO DE PRODUCCIÓN (herramienta, no corre en CI).
 *
 * Opera el catálogo REAL —el que el dueño cargó— y verifica cada paso contra una
 * contabilidad calculada aparte: las expectativas se derivan leyendo
 * `recipe_edges` de la base, NUNCA llamando a las funciones de costeo de la app.
 * Si usara `expandRecipe` o `computeProductCost`, un error en ellas se
 * reflejaría idéntico en el "esperado" y la prueba pasaría celebrando el bug.
 *
 *   TEST_DATABASE_URL=…/pos_tercos_espejo_test pnpm -F @pos-tercos/api exec jest \
 *     --config test/jest-e2e.json --runInBand --forceExit \
 *     --testRegex 'espejo-prod\.tool\.ts$'
 *
 * NO llama `cleanDb`: opera sobre la copia tal como vino de producción.
 */
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { mesLocalQuery } from './helpers/local-day';

/** Tolerancia en pesos: los montos se guardan con 2 decimales. */
const CENTAVO = 0.02;
/** Tolerancia en unidades de inventario: los deltas se guardan con 4 decimales. */
const UNIDAD = 0.001;

interface Arista {
  childIngredientId: string | null;
  childSubproductId: string | null;
  quantityNeta: number;
  mermaPct: number;
}
interface Consumo {
  ingredientes: Map<string, number>;
  subproductos: Map<string, number>;
}

describe('Espejo de producción: flujo completo con variantes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;
  let shiftId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const fallas: string[] = [];
  const notas: string[] = [];
  const revisar = (ok: boolean, mensaje: string) => {
    if (!ok) fallas.push(mensaje);
  };

  // ---------- Catálogo leído de la base (fuente de las expectativas) ----------
  const aristasDeProducto = new Map<string, Arista[]>();
  const aristasDeVariante = new Map<string, Arista[]>();
  const aristasDeSubproducto = new Map<string, Arista[]>();
  const costoInsumo = new Map<string, number | null>();
  const rendimiento = new Map<string, number>();
  const nombreInsumo = new Map<string, string>();

  /** Costo de 1 unidad de un subproducto, recursivo, calculado acá. */
  const costoSubproducto = (id: string, visto = new Set<string>()): number | null => {
    if (visto.has(id)) return null;
    visto.add(id);
    const y = rendimiento.get(id) ?? 0;
    if (y <= 0) return null;
    let total = 0;
    for (const e of aristasDeSubproducto.get(id) ?? []) {
      const bruto = e.quantityNeta / (1 - e.mermaPct);
      const unitario = e.childIngredientId
        ? costoInsumo.get(e.childIngredientId) ?? null
        : costoSubproducto(e.childSubproductId as string, visto);
      if (unitario === null) return null;
      total += bruto * unitario;
    }
    return total / y;
  };

  /** Lo que consume UNA unidad de (producto, variante): un nivel, con merma. */
  const consumoDe = (productId: string, sizeId: string | null, cantidad: number): Consumo => {
    const salida: Consumo = { ingredientes: new Map(), subproductos: new Map() };
    const todas = [
      ...(aristasDeProducto.get(productId) ?? []),
      ...(sizeId ? aristasDeVariante.get(sizeId) ?? [] : []),
    ];
    for (const e of todas) {
      const bruto = (e.quantityNeta / (1 - e.mermaPct)) * cantidad;
      if (e.childIngredientId) {
        salida.ingredientes.set(
          e.childIngredientId,
          (salida.ingredientes.get(e.childIngredientId) ?? 0) + bruto,
        );
      } else {
        const k = e.childSubproductId as string;
        salida.subproductos.set(k, (salida.subproductos.get(k) ?? 0) + bruto);
      }
    }
    return salida;
  };

  /** Costo de 1 unidad de (producto, variante), calculado acá. */
  const costoDe = (productId: string, sizeId: string | null): number | null => {
    const c = consumoDe(productId, sizeId, 1);
    let total = 0;
    for (const [id, qty] of c.ingredientes) {
      const u = costoInsumo.get(id) ?? null;
      if (u === null) return null;
      total += qty * u;
    }
    for (const [id, qty] of c.subproductos) {
      const u = costoSubproducto(id);
      if (u === null) return null;
      total += qty * u;
    }
    return total;
  };

  const movimientosDe = async (saleId: string) => {
    const filas = await prisma.inventoryMovement.findMany({
      where: { sourceType: 'sale', sourceId: saleId },
    });
    const ing = new Map<string, number>();
    const sub = new Map<string, number>();
    for (const m of filas) {
      if (m.ingredientId) ing.set(m.ingredientId, (ing.get(m.ingredientId) ?? 0) + Number(m.delta));
      if (m.subproductId) sub.set(m.subproductId, (sub.get(m.subproductId) ?? 0) + Number(m.delta));
    }
    return { ing, sub };
  };

  const cobrar = async (
    items: object[],
    extra: object = {},
    pago: object | null = null,
  ): Promise<{ id: string; total: number; body: Record<string, unknown> }> => {
    const venta = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'COUNTER', items, ...extra })
      .expect(201);
    const total = venta.body.total as number;
    await request
      .post(`/sales/${venta.body.id}/confirm-payment`)
      .set(auth())
      .send(pago ?? { method: 'CASH', amountReceived: total })
      .expect(201);
    return { id: venta.body.id as string, total, body: venta.body };
  };

  const detalleTurno = async () =>
    (await request.get(`/shifts/${shiftId}/detail`).set(auth()).expect(200)).body as {
      summary: { totalRevenue: number; byMethod: Array<{ method: string; total: number }> };
      orders: Array<{
        id: string;
        total: number;
        status: string;
        costTotal: number | null;
        items: Array<{ name: string; quantity: number; lineTotal: number; lineCost: number | null }>;
      }>;
    };

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());

    const db = (
      await prisma.$queryRawUnsafe<Array<{ db: string }>>('SELECT current_database() AS db')
    )[0].db;
    if (!db.includes('espejo')) {
      throw new Error(`Esta herramienta solo corre contra el espejo. Base actual: ${db}`);
    }

    const hash = await bcrypt.hash('espejo12345', 10);
    await prisma.user.upsert({
      where: { email: 'auditor@espejo.local' },
      update: { passwordHash: hash, active: true, mustChangePwd: false, role: 'DUENO' },
      create: {
        email: 'auditor@espejo.local',
        fullName: 'Auditor Espejo',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'auditor@espejo.local', 'espejo12345');

    // --- Catálogo y recetas, leídos crudos ---
    for (const e of await prisma.recipeEdge.findMany()) {
      const arista: Arista = {
        childIngredientId: e.childIngredientId,
        childSubproductId: e.childSubproductId,
        quantityNeta: Number(e.quantityNeta),
        mermaPct: Number(e.mermaPct),
      };
      const push = (mapa: Map<string, Arista[]>, k: string) =>
        mapa.set(k, [...(mapa.get(k) ?? []), arista]);
      if (e.parentProductId) push(aristasDeProducto, e.parentProductId);
      else if (e.parentSizeId) push(aristasDeVariante, e.parentSizeId);
      else if (e.parentSubproductId) push(aristasDeSubproducto, e.parentSubproductId);
    }
    for (const i of await prisma.ingredient.findMany()) {
      nombreInsumo.set(i.id, i.name);
      const cf = Number(i.conversionFactor);
      costoInsumo.set(
        i.id,
        i.lastUnitCost !== null && cf > 0 ? Number(i.lastUnitCost) / cf : null,
      );
    }
    for (const s of await prisma.subproduct.findMany()) {
      rendimiento.set(s.id, Number(s.yield));
      nombreInsumo.set(s.id, s.name);
    }

    // Caja: la que esté abierta, o una nueva.
    const actual = await request.get('/shifts/current').set(auth());
    shiftId =
      actual.status === 200 && actual.body?.id
        ? (actual.body.id as string)
        : ((
            await request.post('/shifts/open').set(auth()).send({ openingCash: 200_000 }).expect(201)
          ).body.id as string);
  }, 180_000);

  afterAll(async () => {
    console.log(
      `\n${'='.repeat(70)}\nRESULTADO: ${fallas.length === 0 ? 'SIN FALLAS' : `${fallas.length} FALLAS`}\n${'='.repeat(70)}` +
        (fallas.length ? '\n' + fallas.map((f) => ` ✗ ${f}`).join('\n') : '') +
        (notas.length ? '\n\nNOTAS:\n' + notas.map((n) => ` · ${n}`).join('\n') : ''),
    );
    await app.close();
  });

  it('el flujo completo cuadra contra la contabilidad independiente', async () => {
    const cogs = app.get(CogsService);
    const productos = await prisma.product.findMany({
      where: { isActive: true },
      include: { sizes: { orderBy: { sortOrder: 'asc' } } },
    });
    const conVariantes = productos.filter((p) => p.sizes.length > 0 && !p.isCombo);
    const sinVariantes = productos.filter(
      (p) => p.sizes.length === 0 && !p.isCombo && !p.directResale,
    );
    const reventa = productos.filter((p) => p.directResale);
    const combos = productos.filter((p) => p.isCombo);
    console.log(
      `catálogo: ${conVariantes.length} con variantes · ${sinVariantes.length} preparados sin variante · ${reventa.length} de reventa · ${combos.length} combos`,
    );

    // ================= 1. Costo de cada producto y cada variante =================
    const costosApi = (await request.get('/product-costs/with-variants').set(auth()).expect(200))
      .body as Array<{
      productId: string;
      totalCost: number | null;
      variants: Array<{ sizeId: string; name: string; totalCost: number | null }>;
    }>;
    const porProducto = new Map(costosApi.map((c) => [c.productId, c]));

    for (const p of productos) {
      if (p.isCombo || p.directResale) continue;
      const fila = porProducto.get(p.id);
      const mio = costoDe(p.id, null);
      revisar(
        mio === null
          ? fila?.totalCost === null
          : Math.abs((fila?.totalCost ?? NaN) - mio) < CENTAVO,
        `costo base de "${p.name}": la app dice ${fila?.totalCost}, la cuenta independiente ${mio}`,
      );
      for (const s of p.sizes) {
        const v = fila?.variants.find((x) => x.sizeId === s.id);
        const mioV = costoDe(p.id, s.id);
        revisar(
          mioV === null
            ? v?.totalCost === null
            : Math.abs((v?.totalCost ?? NaN) - mioV) < CENTAVO,
          `costo de "${p.name} · ${s.name}": la app dice ${v?.totalCost}, la cuenta independiente ${mioV}`,
        );
        // Y la ficha de esa variante tiene que decir lo mismo que el batch.
        const ficha = (
          await request
            .get(`/products/${p.id}/sizes/${s.id}/expanded-cost`)
            .set(auth())
            .expect(200)
        ).body as { totalCost: number | null };
        revisar(
          (ficha.totalCost === null && v?.totalCost === null) ||
            Math.abs((ficha.totalCost ?? NaN) - (v?.totalCost ?? NaN)) < CENTAVO,
          `"${p.name} · ${s.name}": la ficha (${ficha.totalCost}) y la tabla (${v?.totalCost}) no coinciden`,
        );
      }
    }

    // ================= 2. Vender cada variante y verificar el consumo =================
    const vendidas: Array<{ saleId: string; productId: string; sizeId: string; nombre: string; costo: number | null; total: number }> = [];
    for (const p of conVariantes) {
      for (const s of p.sizes) {
        const venta = await cobrar([{ productId: p.id, sizeId: s.id, quantity: 1 }]);
        const esperado = consumoDe(p.id, s.id, 1);
        const real = await movimientosDe(venta.id);

        for (const [id, qty] of esperado.ingredientes) {
          const movido = -(real.ing.get(id) ?? 0);
          revisar(
            Math.abs(movido - qty) < Math.max(UNIDAD, qty * 1e-6),
            `"${p.name} · ${s.name}" debía consumir ${qty} de ${nombreInsumo.get(id)} y descontó ${movido}`,
          );
        }
        for (const [id, qty] of esperado.subproductos) {
          const movido = -(real.sub.get(id) ?? 0);
          revisar(
            Math.abs(movido - qty) < Math.max(UNIDAD, qty * 1e-6),
            `"${p.name} · ${s.name}" debía consumir ${qty} del subproducto ${id} y descontó ${movido}`,
          );
        }
        revisar(
          real.ing.size === esperado.ingredientes.size &&
            real.sub.size === esperado.subproductos.size,
          `"${p.name} · ${s.name}" descontó ${real.ing.size}+${real.sub.size} items y la receta tiene ${esperado.ingredientes.size}+${esperado.subproductos.size}`,
        );
        vendidas.push({
          saleId: venta.id,
          productId: p.id,
          sizeId: s.id,
          nombre: `${p.name} · ${s.name}`,
          costo: costoDe(p.id, s.id),
          total: venta.total,
        });
      }
    }

    // ================= 3. La ganancia del pedido usa la variante =================
    let detalle = await detalleTurno();
    for (const v of vendidas) {
      const pedido = detalle.orders.find((o) => o.id === v.saleId);
      revisar(!!pedido, `el pedido de "${v.nombre}" no aparece en el detalle de la caja`);
      if (pedido && v.costo !== null) {
        revisar(
          Math.abs((pedido.costTotal ?? NaN) - v.costo) < 1,
          `"${v.nombre}": la caja muestra un costo de ${pedido.costTotal} y la cuenta independiente da ${v.costo}`,
        );
      }
    }

    // ================= 4. Dos variantes del mismo plato en un ticket =================
    if (conVariantes.length > 0 && conVariantes[0].sizes.length >= 2) {
      const p = conVariantes[0];
      const [a, b] = p.sizes;
      const mixta = await cobrar([
        { productId: p.id, sizeId: a.id, quantity: 1 },
        { productId: p.id, sizeId: b.id, quantity: 2 },
      ]);
      const esperado = consumoDe(p.id, a.id, 1);
      for (const [id, qty] of consumoDe(p.id, b.id, 2).ingredientes) {
        esperado.ingredientes.set(id, (esperado.ingredientes.get(id) ?? 0) + qty);
      }
      for (const [id, qty] of consumoDe(p.id, b.id, 2).subproductos) {
        esperado.subproductos.set(id, (esperado.subproductos.get(id) ?? 0) + qty);
      }
      const real = await movimientosDe(mixta.id);
      for (const [id, qty] of esperado.ingredientes) {
        revisar(
          Math.abs(-(real.ing.get(id) ?? 0) - qty) < Math.max(UNIDAD, qty * 1e-6),
          `ticket con dos variantes: ${nombreInsumo.get(id)} debía bajar ${qty} y bajó ${-(real.ing.get(id) ?? 0)}`,
        );
      }
      const costoMixto = (costoDe(p.id, a.id) ?? 0) + 2 * (costoDe(p.id, b.id) ?? 0);
      detalle = await detalleTurno();
      const pedido = detalle.orders.find((o) => o.id === mixta.id);
      revisar(
        Math.abs((pedido?.costTotal ?? NaN) - costoMixto) < 1,
        `ticket con dos variantes: la caja dice ${pedido?.costTotal} y la cuenta da ${costoMixto}`,
      );
    }

    // ================= 5. Otros tipos de producto =================
    for (const p of [...reventa.slice(0, 2), ...sinVariantes.slice(0, 2), ...combos.slice(0, 1)]) {
      const venta = await cobrar([{ productId: p.id, quantity: 1 }]);
      revisar(venta.total > 0, `"${p.name}" se cobró en ${venta.total}`);
    }

    // ================= 6. Descuento manual y cuenta dividida =================
    const conDescuento = await cobrar(
      [{ productId: conVariantes[0].id, sizeId: conVariantes[0].sizes[0].id, quantity: 1 }],
      { orderDiscount: { kind: 'FIXED', value: 2000 }, discountReason: 'Prueba de espejo' },
    );
    revisar(
      Math.abs(conDescuento.total - (conVariantes[0].basePrice.toNumber() + Number(conVariantes[0].sizes[0].priceModifier) - 2000)) < CENTAVO,
      `descuento manual: total ${conDescuento.total}`,
    );

    const paraDividir = await request
      .post('/sales')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'COUNTER',
        items: [{ productId: conVariantes[0].id, sizeId: conVariantes[0].sizes[1].id, quantity: 2 }],
      })
      .expect(201);
    const mitad = Math.round((paraDividir.body.total as number) / 2);
    await request
      .post(`/sales/${paraDividir.body.id}/confirm-payment`)
      .set(auth())
      .send({
        payments: [
          { method: 'CASH', amount: mitad, amountReceived: mitad },
          {
            method: 'CASH',
            amount: (paraDividir.body.total as number) - mitad,
            amountReceived: (paraDividir.body.total as number) - mitad,
          },
        ],
      })
      .expect(201);

    // ================= 7. Anulación: el stock vuelve exacto =================
    const aAnular = vendidas[0];
    const antesDeAnular = await movimientosDe(aAnular.saleId);
    await request
      .post('/approvals/pin')
      .set(auth())
      .send({ pin: '654321', password: 'espejo12345' })
      .expect((r) => {
        if (r.status >= 300) throw new Error(`PIN: ${r.status} ${JSON.stringify(r.body)}`);
      });
    await request
      .post(`/sales/${aAnular.saleId}/void`)
      .set(auth())
      .set('X-Approval-Pin', '654321')
      .send({ reason: 'Prueba de anulación en el espejo' })
      .expect(201);
    // La reversa conserva `sourceType: 'sale'` (es la misma venta), así que lo
    // que se verifica es lo que de verdad importa: que el NETO de esa venta
    // quede en cero — ni una unidad de más ni de menos.
    const despuesDeAnular = await movimientosDe(aAnular.saleId);
    for (const [id] of [...antesDeAnular.ing, ...antesDeAnular.sub]) {
      const neto = (despuesDeAnular.ing.get(id) ?? 0) + (despuesDeAnular.sub.get(id) ?? 0);
      revisar(
        Math.abs(neto) < UNIDAD,
        `anular "${aAnular.nombre}": ${nombreInsumo.get(id) ?? id} quedó en ${neto}, no en cero`,
      );
    }
    revisar(
      [...antesDeAnular.ing.keys()].length > 0,
      `anular "${aAnular.nombre}": la venta no había consumido nada, la prueba no verifica`,
    );

    // ================= 8. Cortesía de una variante =================
    const paraRegalar = conVariantes[1] ?? conVariantes[0];
    const tamRegalo = paraRegalar.sizes[paraRegalar.sizes.length - 1];
    const cortesia = await request
      .post('/cortesias')
      .set(auth())
      .send({
        productId: paraRegalar.id,
        sizeId: tamRegalo.id,
        quantity: 1,
        reason: 'Prueba de espejo',
      });
    if (cortesia.status === 201) {
      const esperado = consumoDe(paraRegalar.id, tamRegalo.id, 1);
      const movs = await prisma.inventoryMovement.findMany({
        where: { sourceType: 'cortesia', sourceId: cortesia.body.id as string },
      });
      for (const [id, qty] of esperado.ingredientes) {
        const m = movs.find((x) => x.ingredientId === id);
        revisar(
          Math.abs(-Number(m?.delta ?? 0) - qty) < Math.max(UNIDAD, qty * 1e-6),
          `cortesía de "${paraRegalar.name} · ${tamRegalo.name}": ${nombreInsumo.get(id)} debía bajar ${qty}`,
        );
      }
      const esperadoCosto = costoDe(paraRegalar.id, tamRegalo.id);
      const fifo = cortesia.body.fifoCost;
      if (esperadoCosto !== null && typeof fifo === 'number') {
        // El costo de una cortesía sale del FIFO (el lote del que salió), no del
        // último precio: se comparan órdenes de magnitud, no el peso exacto.
        revisar(
          fifo > 0,
          `la cortesía de "${paraRegalar.name} · ${tamRegalo.name}" quedó costeada en ${fifo}`,
        );
        notas.push(
          `cortesía "${paraRegalar.name} · ${tamRegalo.name}": FIFO ${Math.round(fifo)} · estimado por receta ${Math.round(esperadoCosto)}`,
        );
      }
    } else {
      notas.push(`la cortesía respondió ${cortesia.status} (${JSON.stringify(cortesia.body).slice(0, 120)})`);
    }

    // ================= 9. Identidades de plata =================
    cogs.invalidateLedgerCache();
    detalle = await detalleTurno();
    const vivas = detalle.orders.filter((o) => !['VOID', 'CANCELADO_NO_PAGO'].includes(o.status));
    const sumaPedidos = vivas.reduce((a, o) => a + o.total, 0);
    const porMetodo = detalle.summary.byMethod.reduce((a, m) => a + m.total, 0);
    revisar(
      Math.abs(porMetodo - detalle.summary.totalRevenue) < CENTAVO,
      `en el arqueo, "por método" suma ${porMetodo} y lo vendido ${detalle.summary.totalRevenue}`,
    );
    revisar(
      Math.abs(sumaPedidos - detalle.summary.totalRevenue) < 1,
      `la suma de los pedidos vivos (${sumaPedidos}) no da lo vendido del turno (${detalle.summary.totalRevenue})`,
    );

    const esperadoCaja = (
      await request.get(`/shifts/${shiftId}/expected-cash`).set(auth()).expect(200)
    ).body as { expectedCash: number; openingCash: number; cashSalesTotal: number };
    revisar(
      Math.abs(
        esperadoCaja.expectedCash - (esperadoCaja.openingCash + esperadoCaja.cashSalesTotal),
      ) < 1 + CENTAVO,
      `el efectivo esperado (${esperadoCaja.expectedCash}) no es apertura + ventas en efectivo (${esperadoCaja.openingCash} + ${esperadoCaja.cashSalesTotal})`,
    );

    // ================= 10. El top de productos costea por variante =================
    const top = (
      await request.get('/reports/top-products?limit=100').set(auth()).expect(200)
    ).body as { products: Array<{ productId: string; quantity: number; estCost: number | null }> };
    for (const p of conVariantes) {
      const fila = top.products.find((x) => x.productId === p.id);
      if (!fila) continue;
      const lineas = await prisma.saleItem.groupBy({
        by: ['sizeId'],
        where: { productId: p.id, sale: { paidAt: { not: null }, status: { notIn: ['VOID', 'CANCELADO_NO_PAGO'] } } },
        _sum: { quantity: true },
      });
      let esperado: number | null = 0;
      for (const l of lineas) {
        const u = costoDe(p.id, l.sizeId);
        if (u === null) {
          esperado = null;
          break;
        }
        esperado += u * Number(l._sum.quantity ?? 0);
      }
      revisar(
        esperado === null
          ? fila.estCost === null
          : Math.abs((fila.estCost ?? NaN) - esperado) < 1,
        `top de productos, "${p.name}": la app dice ${fila.estCost} y la cuenta independiente ${esperado}`,
      );
    }

    // ================= 11. El equilibrio de la carta =================
    const fin = (
      await request.get(`/reports/financial/monthly?${mesLocalQuery()}`).set(auth()).expect(200)
    ).body as {
      revenue: number;
      catalogBreakEven: { marginPct: number | null; productsConsidered: number; productsWithoutCost: number };
    };
    const unidadesPorVariante = await prisma.saleItem.groupBy({
      by: ['productId', 'sizeId'],
      where: { sale: { paidAt: { not: null }, status: { notIn: ['VOID', 'CANCELADO_NO_PAGO'] } } },
      _sum: { quantity: true },
    });
    const unidades = new Map(
      unidadesPorVariante.map((u) => [`${u.productId}:${u.sizeId ?? ''}`, Number(u._sum.quantity ?? 0)]),
    );
    let ingreso = 0;
    let contribucion = 0;
    let consideradas = 0;
    let sinCosto = 0;
    for (const p of productos) {
      const precioBase = p.isCombo && p.comboPrice ? Number(p.comboPrice) : Number(p.basePrice);
      const lineas: Array<{ precio: number; costo: number | null; unidades: number }> = [];
      if (!p.isCombo && p.sizes.length > 0) {
        for (const s of p.sizes) {
          lineas.push({
            precio: precioBase + Number(s.priceModifier),
            costo: p.directResale ? null : costoDe(p.id, s.id),
            unidades: unidades.get(`${p.id}:${s.id}`) ?? 0,
          });
        }
        const base = unidades.get(`${p.id}:`) ?? 0;
        if (base > 0) {
          lineas.push({ precio: precioBase, costo: costoDe(p.id, null), unidades: base });
        }
      } else {
        const c = porProducto.get(p.id)?.totalCost ?? null;
        lineas.push({
          precio: precioBase,
          costo: c,
          unidades: unidades.get(`${p.id}:`) ?? 0,
        });
      }
      for (const l of lineas) {
        if (l.precio <= 0) continue;
        if (l.costo === null) {
          sinCosto += 1;
          continue;
        }
        consideradas += 1;
        ingreso += l.precio * l.unidades;
        contribucion += (l.precio - l.costo) * l.unidades;
      }
    }
    revisar(
      fin.catalogBreakEven.productsConsidered === consideradas,
      `el equilibrio cuenta ${fin.catalogBreakEven.productsConsidered} opciones y la cuenta independiente ${consideradas}`,
    );
    revisar(
      fin.catalogBreakEven.productsWithoutCost === sinCosto,
      `el equilibrio reporta ${fin.catalogBreakEven.productsWithoutCost} opciones sin costo y la cuenta independiente ${sinCosto}`,
    );
    if (ingreso > 0) {
      revisar(
        Math.abs((fin.catalogBreakEven.marginPct ?? NaN) - contribucion / ingreso) < 0.0005,
        `el margen de la carta: la app dice ${fin.catalogBreakEven.marginPct} y la cuenta independiente ${contribucion / ingreso}`,
      );
    }

    // ================= 12. Ingresos del P&G contra las ventas =================
    const ventasDelMes = await prisma.sale.aggregate({
      _sum: { total: true, deliveryFee: true },
      where: { paidAt: { not: null }, status: { notIn: ['VOID', 'CANCELADO_NO_PAGO'] } },
    });
    const ingresoEsperado =
      Number(ventasDelMes._sum.total ?? 0) - Number(ventasDelMes._sum.deliveryFee ?? 0);
    revisar(
      Math.abs(fin.revenue - ingresoEsperado) < 1,
      `el P&G reporta ${fin.revenue} de ingresos y la suma de las ventas da ${ingresoEsperado}`,
    );

    expect(fallas).toEqual([]);
  }, 900_000);
});
