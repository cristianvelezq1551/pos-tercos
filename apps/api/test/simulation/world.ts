/**
 * Mundo de la simulación: arma un negocio completo por la API pública y
 * expone envoltorios tipados de cada operación financiera.
 *
 * Todo entra por HTTP a propósito. Llamar a los services salteándose los
 * controllers dejaría fuera la validación Zod, los guards de rol y los pipes —
 * que es justo donde se cuela un 400 silencioso o un campo que no viaja.
 */
import * as bcrypt from 'bcrypt';
import type supertest from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, loginAs } from '../helpers/app-bootstrap';
import { cleanDb } from '../helpers/db-cleaner';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { CogsService } from '../../src/reports/cogs.service';
import type { Rng } from './rng';
import type { AristaReceta, ProductoSombra, SubproductoSombra } from './shadow';
import type { PromoSombra } from './promos';

/**
 * Producto con tamaños y extras. Los dos mueven el PRECIO; además el tamaño
 * puede traer receta propia (aditiva sobre la del producto) y el extra su
 * `recipeDelta`. Sin esto, "Doble carne" se cobraría y no descontaría carne.
 */
export interface ProductoConOpciones {
  producto: ProductoSombra;
  tamanos: Array<{ id: string; priceModifier: number; receta: AristaReceta[] }>;
  extras: Array<{ id: string; priceDelta: number; consumo: AristaReceta[] }>;
}

export const PIN = '246810';

export interface Mundo {
  app: INestApplication;
  prisma: PrismaService;
  request: ReturnType<typeof supertest>;
  cogs: CogsService;
  token: string;
  userId: string;
  shiftId: string;
  openingCash: number;
  /** Insumos: id → unidad de receta y factor de conversión. */
  insumos: Array<{ id: string; nombre: string; costoInicial: number }>;
  subproductos: SubproductoSombra[];
  productos: ProductoSombra[];
  /** Índice por id para expandir combos en el modelo sombra. */
  catalogo: Map<string, ProductoSombra>;
  /** Proveedor de las facturas de compra. */
  supplierId: string;
  supplierNit: string;
  /** Promociones vigentes (los cuatro tipos, y dos compitiendo por un producto). */
  promos: PromoSombra[];
  /** Producto con variantes y extras: precio Y consumo cambian por opción. */
  conOpciones: ProductoConOpciones;
  auth: () => { Authorization: string };
}

const NOMBRES_INSUMO = ['Carne', 'Pan', 'Queso', 'Papa', 'Salsa', 'Lechuga'];

/**
 * Construye el negocio: dueño con PIN, insumos con stock inicial valorizado,
 * subproductos con receta, productos (reventa, preparados y un combo) y la
 * caja abierta.
 */
export async function construirMundo(rng: Rng): Promise<Mundo> {
  // Anular y reembolsar están limitados a 5 cada 5 minutos POR IP, y toda la
  // simulación pega desde 127.0.0.1: sin neutralizar el contador, la corrida
  // muere con 429 por vecindad en vez de por lo que se está midiendo.
  //
  // Se reemplaza el STORAGE, no el guard: `ThrottlerGuard` va como APP_GUARD
  // (donde `overrideGuard` no llega) y pisar ese token se llevaría por delante
  // los guards de autenticación y de rol. Con el contador siempre en 1 el guard
  // sigue corriendo de verdad, pero nunca acumula. Mismo criterio que
  // `web-delivery.e2e-spec.ts`; el anti-abuso se prueba aislado en su unit test.
  const { app, prisma, request } = await bootstrapApp((b) =>
    b.overrideProvider(ThrottlerStorage).useValue({
      increment: () =>
        Promise.resolve({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
    }),
  );
  await cleanDb(prisma);
  const cogs = app.get(CogsService);

  const hash = await bcrypt.hash('dev12345', 10);
  const user = await prisma.user.create({
    data: {
      email: `sim-dueno@test.local`,
      fullName: 'Dueño Simulación',
      role: 'DUENO',
      passwordHash: hash,
      mustChangePwd: false,
      active: true,
    },
  });
  const token = await loginAs(request, 'sim-dueno@test.local');
  const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

  await request
    .post('/approvals/pin')
    .set(auth())
    .send({ pin: PIN, password: 'dev12345' })
    .expect(201);

  // ---------- Insumos ----------
  const insumos: Mundo['insumos'] = [];
  for (const nombre of NOMBRES_INSUMO) {
    const id = (
      await request
        .post('/ingredients')
        .set(auth())
        .send({
          name: `${nombre} Sim`,
          unitPurchase: 'kg',
          unitRecipe: 'g',
          conversionFactor: 1000,
          thresholdMin: 0,
          isActive: true,
        })
        .expect(201)
    ).body.id as string;
    // Costos distintos por insumo para que un error de atribución (cargarle a
    // un insumo el costo de otro) no se cancele por simetría.
    const costoInicial = rng.int(8, 40);
    insumos.push({ id, nombre, costoInicial });
  }

  // ---------- Subproductos con receta ----------
  const subproductos: SubproductoSombra[] = [];
  for (let i = 0; i < 2; i += 1) {
    const rendimiento = rng.pick([10, 20, 25]);
    const id = (
      await request
        .post('/subproducts')
        .set(auth())
        .send({
          name: `Preparado ${i + 1} Sim`,
          yield: rendimiento,
          unit: 'porcion',
          thresholdMin: 0,
        })
        .expect(201)
    ).body.id as string;

    const usados = rng.sample(insumos, rng.int(1, 2));
    const receta = usados.map((ins) => ({
      childType: 'ingredient' as const,
      childId: ins.id,
      // Mermas no triviales: 0 esconde errores de división.
      quantityNeta: rng.int(50, 200),
      mermaPct: rng.pick([0, 0.05, 0.1]),
    }));
    await request
      .put(`/subproducts/${id}/recipe`)
      .set(auth())
      .send({ edges: receta })
      .expect(200);
    subproductos.push({ id, nombre: `Preparado ${i + 1}`, yield: rendimiento, receta });
  }

  // ---------- Productos ----------
  const productos: ProductoSombra[] = [];

  // Reventa directa (su stock ES el producto): ejercita el FIFO sin recetas.
  for (let i = 0; i < 2; i += 1) {
    const precio = rng.int(3000, 8000);
    const id = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Bebidas',
          name: `Bebida ${i + 1} Sim`,
          basePrice: precio,
          directResale: true,
          unitPurchase: 'caja',
          unitStock: 'unidad',
          conversionFactor: 24,
          thresholdMin: 0,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;
    productos.push({
      id,
      nombre: `Bebida ${i + 1}`,
      precio,
      directResale: true,
      isCombo: false,
      componentes: [],
      receta: [],
    });
  }

  // Preparados: mezclan subproducto + insumo directo (el caso que más cuentas
  // encadena: receta de un nivel + FIFO de dos entidades distintas).
  for (let i = 0; i < 2; i += 1) {
    const precio = rng.int(9000, 20000);
    const id = (
      await request
        .post('/products')
        .set(auth())
        .send({
          category: 'Comidas',
          name: `Plato ${i + 1} Sim`,
          basePrice: precio,
          directResale: false,
          modifiersEnabled: false,
        })
        .expect(201)
    ).body.id as string;

    const sub = subproductos[i % subproductos.length]!;
    const insumoDirecto = rng.pick(insumos);
    const receta = [
      {
        childType: 'subproduct' as const,
        childId: sub.id,
        quantityNeta: rng.int(1, 3),
        mermaPct: 0,
      },
      {
        childType: 'ingredient' as const,
        childId: insumoDirecto.id,
        quantityNeta: rng.int(20, 80),
        mermaPct: rng.pick([0, 0.1]),
      },
    ];
    await request.put(`/products/${id}/recipe`).set(auth()).send({ edges: receta }).expect(200);
    productos.push({
      id,
      nombre: `Plato ${i + 1}`,
      precio,
      directResale: false,
      isCombo: false,
      componentes: [],
      receta,
    });
  }

  // ---------- Producto con tamaños y extras ----------
  // El precio de la línea es base + tamaño + extras, y el consumo es la receta
  // del producto MÁS la del tamaño MÁS el `recipeDelta` de cada extra. Es el
  // camino donde un error se cobra bien y descuenta mal (o al revés).
  const insumoExtra = rng.pick(insumos);
  const insumoTamano = rng.pick(insumos);
  const precioOpciones = rng.int(10_000, 18_000);
  const creadoOpciones = await request
    .post('/products')
    .set(auth())
    .send({
      category: 'Comidas',
      name: 'Plato con opciones Sim',
      basePrice: precioOpciones,
      directResale: false,
      modifiersEnabled: true,
      sizes: [
        { name: 'Normal', priceModifier: 0, sortOrder: 0 },
        { name: 'Grande', priceModifier: rng.int(1500, 4000), sortOrder: 1 },
      ],
      modifiers: [
        {
          name: 'Doble porción',
          priceDelta: rng.int(2000, 5000),
          recipeDelta: [
            {
              childType: 'ingredient',
              childId: insumoExtra.id,
              quantity: rng.int(30, 120),
            },
          ],
        },
        { name: 'Sin sal', priceDelta: 0 },
      ],
    })
    .expect(201);
  const opcionesId = creadoOpciones.body.id as string;
  const recetaOpciones: AristaReceta[] = [
    {
      childType: 'ingredient',
      childId: rng.pick(insumos).id,
      quantityNeta: rng.int(60, 150),
      mermaPct: rng.pick([0, 0.1]),
    },
  ];
  await request
    .put(`/products/${opcionesId}/recipe`)
    .set(auth())
    .send({ edges: recetaOpciones })
    .expect(200);

  const tamanosApi = creadoOpciones.body.sizes as Array<{
    id: string;
    name: string;
    priceModifier: number;
  }>;
  const extrasApi = creadoOpciones.body.modifiers as Array<{
    id: string;
    name: string;
    priceDelta: number;
  }>;

  // El tamaño grande consume ADEMÁS su propia receta: pedir grande tiene que
  // descontar más insumo, no solo cobrar más.
  const grande = tamanosApi.find((t) => t.name === 'Grande')!;
  const recetaGrande: AristaReceta[] = [
    {
      childType: 'ingredient',
      childId: insumoTamano.id,
      quantityNeta: rng.int(20, 60),
      mermaPct: 0,
    },
  ];
  await request
    .put(`/products/${opcionesId}/sizes/${grande.id}/recipe`)
    .set(auth())
    .send({ edges: recetaGrande })
    .expect(200);

  const productoOpciones: ProductoSombra = {
    id: opcionesId,
    nombre: 'Plato con opciones',
    precio: precioOpciones,
    directResale: false,
    isCombo: false,
    componentes: [],
    receta: recetaOpciones,
  };
  productos.push(productoOpciones);

  const conOpciones: ProductoConOpciones = {
    producto: productoOpciones,
    tamanos: tamanosApi.map((t) => ({
      id: t.id,
      priceModifier: t.priceModifier,
      receta: t.id === grande.id ? recetaGrande : [],
    })),
    extras: extrasApi.map((e) => ({
      id: e.id,
      priceDelta: e.priceDelta,
      consumo:
        e.name === 'Doble porción'
          ? [
              {
                childType: 'ingredient' as const,
                childId: insumoExtra.id,
                // El `recipeDelta` de un extra es BRUTO: ya viene con la merma
                // incluida, así que no se vuelve a inflar.
                quantityNeta: creadoOpciones.body.modifiers.find(
                  (m: { name: string }) => m.name === 'Doble porción',
                ).recipeDelta[0].quantity,
                mermaPct: 0,
              },
            ]
          : [],
    })),
  };

  // Combo: consume por componentes. Precio propio (no la suma de las partes),
  // que es donde se rompe el prorrateo si alguien lo asume.
  const compA = productos[0]!;
  const compB = productos[2]!;
  const precioCombo = rng.int(12000, 22000);
  const comboId = (
    await request
      .post('/products')
      .set(auth())
      .send({
        category: 'Combos',
        name: 'Combo Sim',
        basePrice: precioCombo,
        isCombo: true,
        comboPrice: precioCombo,
        modifiersEnabled: false,
        comboComponents: [
          { productId: compA.id, quantity: 1 },
          { productId: compB.id, quantity: 1 },
        ],
      })
      .expect(201)
  ).body.id as string;
  productos.push({
    id: comboId,
    nombre: 'Combo',
    precio: precioCombo,
    directResale: false,
    isCombo: true,
    componentes: [
      { productId: compA.id, quantity: 1 },
      { productId: compB.id, quantity: 1 },
    ],
    receta: [],
  });

  const catalogo = new Map(productos.map((p) => [p.id, p]));

  // ---------- Config del negocio ----------
  // Los domicilios nacen APAGADOS (`delivery_enabled = false`): es un switch de
  // datos, no de código, y por eso en producción hubo pedidos web sin opción de
  // domicilio con todo el código ya escrito (§7.v21). Acá se enciende
  // explícitamente. El rechazo por radio queda apagado: esa validación tiene su
  // propia suite (`web-address`) y necesita direcciones firmadas por Google.
  await request
    .patch('/business-config')
    .set(auth())
    .send({ deliveryEnabled: true, ordersRespectRadius: false, webOrdersEnabled: true })
    .expect(200);

  // ---------- Proveedor (para las facturas de compra) ----------
  const supplierNit = '900123456';
  const supplierId = (
    await request
      .post('/suppliers')
      .set(auth())
      .send({ name: 'Proveedor Simulación', nit: supplierNit, isActive: true })
      .expect(201)
  ).body.id as string;

  // ---------- Promociones vigentes: los cuatro tipos ----------
  // Todas todos los días y 24 horas, para que el modelo sombra no tenga que
  // reimplementar las ventanas horarias (eso tiene su propia suite). Lo que sí
  // se ejercita acá es el CÁLCULO de cada tipo y, sobre la bebida 1, la regla
  // de quién gana cuando dos promociones compiten: la de mayor descuento
  // ABSOLUTO en pesos, que es la única forma justa de comparar un % con un fijo.
  const promos: PromoSombra[] = [];
  const crearPromo = async (
    cuerpo: Record<string, unknown>,
    sombra: Omit<PromoSombra, 'id'>,
  ): Promise<void> => {
    const res = await request
      .post('/promotions')
      .set(auth())
      .send({
        daysOfWeekMask: 127,
        timeStart: '00:00:00',
        timeEnd: '23:59:59',
        channel: 'BOTH',
        ...cuerpo,
      })
      .expect(201);
    promos.push({ id: res.body.id as string, ...sombra });
  };

  const preparadoConPromo = productos[2]!;
  const bebidaUno = productos[0]!;
  const bebidaDos = productos[1]!;

  const promoPct = rng.pick([0.1, 0.15, 0.2]);
  await crearPromo(
    {
      name: 'Promo porcentaje Sim',
      type: 'PERCENT_OFF',
      discountPct: promoPct,
      productIds: [preparadoConPromo.id],
    },
    { tipo: 'PERCENT_OFF', productoId: preparadoConPromo.id, pct: promoPct },
  );

  // Monto fijo, en un producto SIN competencia: así este tipo siempre se
  // ejercita, pase lo que pase con los valores que sorteó la semilla.
  const fijo = rng.int(400, 1200);
  await crearPromo(
    {
      name: 'Promo fija Sim',
      type: 'FIXED_OFF',
      discountFixed: fijo,
      productIds: [bebidaUno.id],
    },
    { tipo: 'FIXED_OFF', productoId: bebidaUno.id, fijo },
  );

  // Pareja EN DISPUTA sobre el segundo preparado: un porcentaje contra un monto
  // fijo. Cuál gana depende de la cantidad de la línea, y esa es justo la regla
  // que interesa medir (gana el mayor descuento absoluto en pesos). Cualquiera
  // de las dos puede no aplicarse nunca — por eso van marcadas como disputadas.
  const enDisputa = productos[3]!;
  const pctDisputa = rng.pick([0.05, 0.1]);
  await crearPromo(
    {
      name: 'Promo porcentaje en disputa Sim',
      type: 'PERCENT_OFF',
      discountPct: pctDisputa,
      productIds: [enDisputa.id],
    },
    { tipo: 'PERCENT_OFF', productoId: enDisputa.id, pct: pctDisputa, disputada: true },
  );
  const fijoDisputa = rng.int(600, 2500);
  await crearPromo(
    {
      name: 'Promo fija en disputa Sim',
      type: 'FIXED_OFF',
      discountFixed: fijoDisputa,
      productIds: [enDisputa.id],
    },
    { tipo: 'FIXED_OFF', productoId: enDisputa.id, fijo: fijoDisputa, disputada: true },
  );

  // COMBO_OFF: el motor solo la aplica a líneas marcadas como combo — al mismo
  // producto vendido suelto no le hace nada.
  const comboPct = rng.pick([0.1, 0.12]);
  await crearPromo(
    {
      name: 'Promo combo Sim',
      type: 'COMBO_OFF',
      discountPct: comboPct,
      productIds: [comboId],
    },
    { tipo: 'COMBO_OFF', productoId: comboId, pct: comboPct },
  );

  // Lleva 2 y llévate 1: solo cuentan los sets COMPLETOS, así que con 1 o 2
  // unidades no descuenta nada y con 3 regala una.
  await crearPromo(
    {
      name: 'Promo 2x1 Sim',
      type: 'BOGO',
      bogoBuyQty: 2,
      bogoGetQty: 1,
      productIds: [bebidaDos.id],
    },
    { tipo: 'BOGO', productoId: bebidaDos.id, comprar: 2, gratis: 1 },
  );

  const openingCash = rng.money(50_000, 200_000);
  const shiftId = (
    await request.post('/shifts/open').set(auth()).send({ openingCash }).expect(201)
  ).body.id as string;

  return {
    app,
    prisma,
    request,
    cogs,
    token,
    userId: user.id,
    shiftId,
    openingCash,
    insumos,
    subproductos,
    productos,
    catalogo,
    supplierId,
    supplierNit,
    promos,
    conOpciones,
    auth,
  };
}

/**
 * Espera un código concreto y, si no llega, lanza incluyendo el MENSAJE del
 * servidor. `supertest.expect(201)` solo dice "got 400", que en una corrida de
 * miles de operaciones no alcanza para saber qué se rechazó.
 */
export async function esperar(
  peticion: supertest.Test,
  codigo: number,
): Promise<supertest.Response> {
  const res = await peticion;
  if (res.status !== codigo) {
    const cuerpo = res.body as { message?: unknown } | undefined;
    const detalle =
      typeof cuerpo?.message === 'string' ? cuerpo.message : JSON.stringify(cuerpo ?? {});
    throw new Error(
      `${peticion.method} ${peticion.url} devolvió ${res.status} (se esperaba ${codigo}): ${detalle}`,
    );
  }
  return res;
}
