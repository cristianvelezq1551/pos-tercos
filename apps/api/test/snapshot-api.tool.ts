/**
 * HERRAMIENTA DE VALIDACIÓN (no es una prueba, no corre en el CI).
 *
 * Levanta un negocio determinista y guarda la respuesta de TODOS los endpoints
 * de plata en un JSON. Se corre en `main` y en la rama, y se comparan los dos
 * archivos: así "no se rompió nada" deja de ser una afirmación y pasa a ser un
 * diff que se lee.
 *
 *   SNAPSHOT_OUT=/tmp/antes.json pnpm -F @pos-tercos/api exec jest \
 *     --config test/jest-e2e.json --runInBand --forceExit \
 *     --testMatch '**\/snapshot-api.tool.ts'
 *
 * Los ids son aleatorios en cada corrida, así que se normalizan: los que este
 * archivo crea se reemplazan por su nombre (`ID:papa`), los demás por el orden
 * en que aparecen, y toda fecha por `FECHA`. Lo que queda es solo la plata.
 */
import { writeFileSync } from 'node:fs';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CogsService } from '../src/reports/cogs.service';
import { bootstrapApp, loginAs } from './helpers/app-bootstrap';
import { cleanDb } from './helpers/db-cleaner';
import { evitarElSegundoSinPromos, hoyLocal, mesLocalQuery } from './helpers/local-day';

const SALIDA = process.env.SNAPSHOT_OUT ?? '/tmp/snapshot-api.json';

describe('Snapshot de la API (herramienta de validación)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let request: ReturnType<typeof supertest>;
  let token: string;

  /** id real → etiqueta estable, para que el diff no sea un mar de uuids. */
  const etiquetas = new Map<string, string>();
  const anotar = (id: string, etiqueta: string) => {
    etiquetas.set(id, `ID:${etiqueta}`);
    return id;
  };

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma, request } = await bootstrapApp());
    await cleanDb(prisma);
  }, 120_000);

  afterAll(async () => {
    // SNAPSHOT_KEEP=1 deja el negocio en pie para mirarlo en el navegador.
    if (!process.env.SNAPSHOT_KEEP) await cleanDb(prisma);
    await app.close();
  });

  it('captura', async () => {
    const cogs = app.get(CogsService);
    const hash = await bcrypt.hash('dev12345', 10);
    await prisma.user.create({
      data: {
        email: 'dueno-snap@test.local',
        fullName: 'Dueño Snapshot',
        role: 'DUENO',
        passwordHash: hash,
        mustChangePwd: false,
        active: true,
      },
    });
    token = await loginAs(request, 'dueno-snap@test.local');

    // ---------------- Catálogo ----------------
    const insumo = async (etiqueta: string, name: string, costoPorKilo: number) => {
      const res = await request
        .post('/ingredients')
        .set(auth())
        .send({ name, unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 100 })
        .expect(201);
      const id = anotar(res.body.id as string, etiqueta);
      await prisma.ingredient.update({ where: { id }, data: { lastUnitCost: costoPorKilo } });
      return id;
    };
    const papa = await insumo('papa', 'Papa', 10_000);
    const pollo = await insumo('pollo', 'Pollo', 30_000);
    const chicharron = await insumo('chicharron', 'Chicharrón', 40_000);

    const sub = await request
      .post('/subproducts')
      .set(auth())
      .send({ name: 'Salsa de la casa', yield: 10, unit: 'porción', thresholdMin: 2 })
      .expect(201);
    const salsa = anotar(sub.body.id as string, 'salsa');
    await request
      .put(`/subproducts/${salsa}/recipe`)
      .set(auth())
      .send({ edges: [{ childType: 'ingredient', childId: papa, quantityNeta: 50, mermaPct: 0.1 }] })
      .expect(200);

    const producto = async (etiqueta: string, body: object) => {
      const res = await request
        .post('/products')
        .set(auth())
        .send({ category: 'Comidas', ...body })
        .expect(201);
      return { id: anotar(res.body.id as string, etiqueta), body: res.body };
    };

    const conVariantes = await producto('plato', {
      name: 'Papas con proteína',
      basePrice: 20_000,
      directResale: false,
      isCombo: false,
      modifiersEnabled: false,
      sizes: [
        { name: 'Sencilla', priceModifier: 0, sortOrder: 0 },
        { name: 'Con pollo', priceModifier: 6000, sortOrder: 1 },
        { name: 'Con chicharrón', priceModifier: 5000, sortOrder: 2 },
      ],
    });
    const tamanos = conVariantes.body.sizes as Array<{ id: string; name: string }>;
    const sencilla = anotar(tamanos.find((t) => t.name === 'Sencilla')!.id, 'tam-sencilla');
    const conPollo = anotar(tamanos.find((t) => t.name === 'Con pollo')!.id, 'tam-pollo');
    const conChicharron = anotar(
      tamanos.find((t) => t.name === 'Con chicharrón')!.id,
      'tam-chicharron',
    );
    void sencilla;

    await request
      .put(`/products/${conVariantes.id}/recipe`)
      .set(auth())
      .send({
        edges: [
          { childType: 'ingredient', childId: papa, quantityNeta: 100, mermaPct: 0.05 },
          { childType: 'subproduct', childId: salsa, quantityNeta: 1, mermaPct: 0 },
        ],
      })
      .expect(200);
    for (const [sizeId, insumoId, gramos] of [
      [conPollo, pollo, 100],
      [conChicharron, chicharron, 50],
    ] as const) {
      await request
        .put(`/products/${conVariantes.id}/sizes/${sizeId}/recipe`)
        .set(auth())
        .send({
          edges: [{ childType: 'ingredient', childId: insumoId, quantityNeta: gramos, mermaPct: 0 }],
        })
        .expect(200);
    }

    const coca = await producto('coca', {
      category: 'Bebidas',
      name: 'Coca-Cola 400ml',
      basePrice: 5000,
      directResale: true,
      unitPurchase: 'caja',
      unitStock: 'unit',
      conversionFactor: 24,
      modifiersEnabled: false,
      thresholdMin: 6,
    });

    // El costo de la reventa sale de su última compra, no del movimiento.
    await prisma.product.update({ where: { id: coca.id }, data: { lastUnitCost: 36_000 } });

    const combo = await producto('combo', {
      category: 'Combos',
      name: 'Combo del día',
      basePrice: 0,
      directResale: false,
      isCombo: true,
      comboPrice: 23_000,
      modifiersEnabled: false,
      comboComponents: [
        { productId: conVariantes.id, quantity: 1 },
        { productId: coca.id, quantity: 1 },
      ],
    });

    const promo = await request
      .post('/promotions')
      .set(auth())
      .send({
        name: 'Bebida 10%',
        type: 'PERCENT_OFF',
        discountPct: 0.1,
        daysOfWeekMask: 127,
        timeStart: '00:00:00',
        timeEnd: '23:59:59',
        productIds: [coca.id],
      })
      .expect(201);
    anotar(promo.body.id as string, 'promo');

    // ---------------- Existencias ----------------
    for (const [id, delta, unitCost] of [
      [papa, 5000, 10],
      [pollo, 5000, 30],
      [chicharron, 5000, 40],
    ] as const) {
      await request
        .post('/inventory/movements')
        .set(auth())
        .send({ entityType: 'INGREDIENT', ingredientId: id, delta, type: 'INITIAL', unitCost })
        .expect(201);
    }
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'PRODUCT', productId: coca.id, delta: 48, type: 'INITIAL', unitCost: 1500 })
      .expect(201);
    // Producción real de una tanda de salsa (consume papa y crea su lote FIFO).
    await request
      .post(`/subproducts/${salsa}/produce`)
      .set(auth())
      .send({ quantityProduced: 20, idempotencyKey: randomUUID() })
      .expect(201);

    // ---------------- Operación ----------------
    // Una promo «todo el día» no aplica en el último segundo (§7.v46): si la
    // corrida lo cruza, los dos snapshots diferirían por el reloj, no por el código.
    await evitarElSegundoSinPromos();
    const caja = await request.post('/shifts/open').set(auth()).send({ openingCash: 100_000 }).expect(201);
    const shiftId = anotar(caja.body.id as string, 'caja');

    const cobrar = async (etiqueta: string, body: object, extra: object = {}) => {
      const venta = await request
        .post('/sales')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ type: 'COUNTER', ...body })
        .expect(201);
      anotar(venta.body.id as string, etiqueta);
      await request
        .post(`/sales/${venta.body.id}/confirm-payment`)
        .set(auth())
        .send({ method: 'CASH', amountReceived: venta.body.total, ...extra })
        .expect(201);
      return venta.body.id as string;
    };

    // 1) La variante cara + dos bebidas con promo.
    await cobrar('venta-variante', {
      items: [
        { productId: conVariantes.id, sizeId: conPollo, quantity: 1 },
        { productId: coca.id, quantity: 2 },
      ],
    });
    // 2) La otra variante, con descuento manual sobre el total.
    await cobrar('venta-descuento', {
      items: [{ productId: conVariantes.id, sizeId: conChicharron, quantity: 2 }],
      orderDiscountKind: 'FIXED',
      orderDiscountValue: 3000,
      discountReason: 'Cliente frecuente',
    });
    // 3) El combo.
    await cobrar('venta-combo', { items: [{ productId: combo.id, quantity: 1 }] });

    // Merma y conteo: mueven las líneas de pérdida del P&G.
    await request
      .post('/inventory/movements')
      .set(auth())
      .send({ entityType: 'INGREDIENT', ingredientId: papa, delta: -200, type: 'WASTE', notes: 'se quemó' })
      .expect(201);

    // ---------------- Captura ----------------
    const mes = mesLocalQuery();
    const hoy = hoyLocal();
    const rango = `from=${hoy}&to=${hoy}`;
    const rutas: string[] = [
      // Costos del catálogo — el corazón de estas etapas
      '/product-costs',
      '/product-costs/with-variants',
      '/subproduct-costs',
      `/products/${conVariantes.id}/expanded-cost`,
      `/products/${conVariantes.id}/sizes/${conPollo}/expanded-cost`,
      `/products/${conVariantes.id}/sizes/${conChicharron}/expanded-cost`,
      `/products/${coca.id}/expanded-cost`,
      `/products/${combo.id}/expanded-cost`,
      `/subproducts/${salsa}/expanded-cost`,
      // Reportes de plata
      `/reports/financial/monthly?${mes}`,
      '/reports/dashboard',
      `/reports/sales-summary?${rango}&granularity=daily`,
      `/reports/top-products?${rango}&limit=50`,
      `/reports/cogs/pnl?${rango}`,
      '/reports/cogs/inventory-valuation',
      `/reports/inventory-usage?${rango}`,
      `/reports/purchases?${rango}`,
      // Caja
      `/shifts/${shiftId}/detail`,
      `/shifts/${shiftId}/expected-cash`,
      // Inventario y catálogo tal como los ven las apps
      '/inventory/stock',
      '/products/availability',
      '/recipe-book',
      '/kitchen/stock',
      '/web/menu',
      '/promotions',
    ];

    const salida: Record<string, unknown> = {};
    for (const ruta of rutas) {
      cogs.invalidateLedgerCache();
      const res = await request.get(ruta).set(auth());
      salida[ruta] = res.status === 200 ? res.body : { __status: res.status, body: res.body };
    }

    // Las RUTAS también llevan ids: sin normalizar la clave, el diff entero
    // sería ruido de uuids.
    const conClavesEstables: Record<string, unknown> = {};
    for (const [ruta, cuerpo] of Object.entries(salida)) {
      conClavesEstables[normalizarRuta(ruta, etiquetas)] = cuerpo;
    }
    writeFileSync(SALIDA, JSON.stringify(normalizar(conClavesEstables, etiquetas), null, 2));
    console.log(`[snapshot] ${rutas.length} rutas guardadas en ${SALIDA}`);
  }, 300_000);
});

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_UUID_EN_TEXTO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const normalizarRuta = (ruta: string, etiquetas: Map<string, string>): string =>
  ruta.replace(RE_UUID_EN_TEXTO, (id) => etiquetas.get(id) ?? 'UUID');
const RE_FECHA = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

/**
 * Deja solo lo que tiene que ser igual entre dos corridas: los ids conocidos
 * pasan a su nombre, los desconocidos al orden en que aparecen (así una lista
 * reordenada SÍ se nota) y las fechas a una constante.
 */
function normalizar(valor: unknown, etiquetas: Map<string, string>): unknown {
  const anonimos = new Map<string, string>();
  const visitar = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (etiquetas.has(v)) return etiquetas.get(v);
      if (RE_UUID.test(v)) {
        if (!anonimos.has(v)) anonimos.set(v, `UUID:${anonimos.size}`);
        return anonimos.get(v);
      }
      if (RE_FECHA.test(v)) return 'FECHA';
      return v;
    }
    if (Array.isArray(v)) {
      const items = v.map(visitar);
      // «Uso y mermas» devuelve sus filas en orden no determinista (se arma
      // desde un mapa). Ordenarlas es lo único que se toca del contenido: en
      // los demás arreglos el orden SÍ significa algo (el ranking del top de
      // productos, la serie del día) y se conserva tal cual.
      const porEntidad = (x: unknown): string | null =>
        x && typeof x === 'object' && 'entityId' in x
          ? `${String((x as Record<string, unknown>).entityType)}:${String((x as Record<string, unknown>).entityId)}`
          : null;
      if (items.length > 1 && items.every((x) => porEntidad(x) !== null)) {
        return [...items].sort((a, b) => porEntidad(a)!.localeCompare(porEntidad(b)!));
      }
      return items;
    }
    if (v && typeof v === 'object') {
      const salida: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        // El número de recibo sale de una secuencia de Postgres que TRUNCATE no
        // reinicia: sube en cada corrida. Su integridad la cubre
        // `receipt-integrity.e2e-spec.ts`; acá solo sería ruido.
        salida[k] = k === 'receiptNumber' ? 'RECIBO' : visitar(val);
      }
      return salida;
    }
    return v;
  };
  return visitar(valor);
}
