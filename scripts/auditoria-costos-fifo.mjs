#!/usr/bin/env node
/**
 * Auditoría de COSTOS contra un API desplegado (QA), por HTTP y como dueño.
 * Responde, con operaciones reales, las tres dudas del dueño (2026-09-11):
 *
 *   1. ¿Por qué el "costo hoy" de la ficha, el "costo real" (FIFO) de la tabla
 *      de productos y el costo de una cortesía del mismo plato dan distinto?
 *   2. ¿Una venta o una cortesía descuentan exactamente lo que dice la receta
 *      (con el tamaño elegido), y eso se ve en movimientos?
 *   3. ¿Qué hace una merma con el stock, los movimientos, el estado del mes y
 *      el reporte de uso, y qué pasa al anularla?
 *
 * Es una prueba de ACEPTACIÓN sobre datos vivos: mide por DELTAS entre el
 * estado antes y después de cada paso. No borra nada al terminar.
 *
 *   API_URL=https://api-qa-5833.up.railway.app AUDITOR_EMAIL=… AUDITOR_PASSWORD=… \
 *   node scripts/auditoria-costos-fifo.mjs
 */

const API = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const EMAIL = process.env.AUDITOR_EMAIL;
const PASSWORD = process.env.AUDITOR_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Faltan AUDITOR_EMAIL y AUDITOR_PASSWORD.');
  process.exit(2);
}
const STAMP = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
const N = (s) => `${s} CF${STAMP}`;

let token = '';
async function api(method, path, body, opts = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (opts.expect !== undefined && res.status !== opts.expect) {
    throw new Error(`${method} ${path} → ${res.status} (esperaba ${opts.expect}): ${text.slice(0, 300)}`);
  }
  return { status: res.status, body: json };
}
const post = (p, b, o) => api('POST', p, b, { expect: 201, ...o });
const get = (p, o) => api('GET', p, undefined, { expect: 200, ...o });
const put = (p, b, o) => api('PUT', p, b, { expect: 200, ...o });

const resultados = [];
let seccionActual = '';
const seccion = (s) => {
  seccionActual = s;
  console.log(`\n== ${s}`);
};
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('es-CO') : JSON.stringify(v));
function check(nombre, actual, esperado, tol = 0.01) {
  const ok = typeof esperado === 'number' ? Math.abs(Number(actual) - esperado) <= tol : actual === esperado;
  resultados.push({ seccion: seccionActual, nombre, ok, actual, esperado });
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : `  → esperado ${fmt(esperado)}, llegó ${fmt(actual)}`}`);
}
function checkTrue(nombre, cond, detalle = '') {
  resultados.push({ seccion: seccionActual, nombre, ok: !!cond, actual: detalle, esperado: 'verdadero' });
  console.log(`${cond ? '  ✓' : '  ✗'} ${nombre}${cond ? '' : `  → ${detalle}`}`);
}
const delta = (a, b, campo) => Number(b[campo]) - Number(a[campo]);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const TTL_MS = 60_000;

const hoy = new Date();
const Y = hoy.getFullYear();
const M = hoy.getMonth() + 1;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const estado = async () => (await get(`/reports/financial/monthly?year=${Y}&month=${M}`)).body;
async function estadoCuando(pred) {
  const inicio = Date.now();
  let s = await estado();
  while (!pred(s) && Date.now() - inicio < TTL_MS + 15_000) {
    await dormir(5_000);
    s = await estado();
  }
  return s;
}
/** Movimientos de un origen, agregados por insumo: nombre → Σ delta. */
async function consumo(sourceType, sourceId) {
  const rows = (await get(`/inventory/movements?source_type=${sourceType}&source_id=${sourceId}&limit=200`)).body;
  const out = new Map();
  for (const m of rows) {
    const k = m.itemName ?? m.ingredientId ?? m.productId ?? m.subproductId;
    out.set(k, (out.get(k) ?? 0) + Number(m.delta));
  }
  return { rows, out };
}
const stock = async (id) => Number((await get(`/inventory/stock/ingredient/${id}`)).body.currentStock);
const margen = async (productId) => {
  const rep = (await get(`/reports/cogs/product-margins?from=${ymd(hoy)}&to=${ymd(hoy)}`)).body;
  return rep.products.find((p) => p.productId === productId) ?? null;
};

async function main() {
  seccion(`Entrada a ${API}`);
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD }, { expect: 200 });
  token = login.body.accessToken;
  checkTrue('sesión de dueño', !!token);
  const st = (await get('/shifts/current-status')).body;
  if (st.stalePreviousDay) throw new Error('Hay una caja abierta de un día anterior: ciérrala antes.');
  if (!st.shift) await post('/shifts/open', { openingCash: 0 });

  // ---- Catálogo: un plato con dos variantes que llevan carne distinta
  seccion('Catálogo: Burrito con variantes Pollo (100 g) y Doble (200 g)');
  const categorias = (await get('/product-categories')).body;
  if (!(Array.isArray(categorias) ? categorias : []).some((c) => String(c.name).toLowerCase() === 'comidas')) {
    await post('/product-categories', { name: 'Comidas' });
  }
  const pan = (await post('/ingredients', { name: N('Pan'), unitPurchase: 'unidad', unitRecipe: 'unidad', conversionFactor: 1, thresholdMin: 0, isActive: true })).body.id;
  const carne = (await post('/ingredients', { name: N('Carne'), unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0, isActive: true })).body.id;
  const queso = (await post('/ingredients', { name: N('Queso'), unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0, isActive: true })).body.id;
  const producto = (await post('/products', {
    category: 'Comidas', name: N('Burrito'), basePrice: 20_000, directResale: false, modifiersEnabled: false,
    sizes: [{ name: 'Pollo', priceModifier: 3_000 }, { name: 'Doble', priceModifier: 5_000 }],
  })).body;
  const burrito = producto.id;
  const pollo = producto.sizes.find((s) => s.name === 'Pollo').id;
  const doble = producto.sizes.find((s) => s.name === 'Doble').id;
  await put(`/products/${burrito}/recipe`, { edges: [
    { childType: 'ingredient', childId: pan, quantityNeta: 1, mermaPct: 0 },
    { childType: 'ingredient', childId: queso, quantityNeta: 20, mermaPct: 0 },
  ] });
  await put(`/products/${burrito}/sizes/${pollo}/recipe`, { edges: [{ childType: 'ingredient', childId: carne, quantityNeta: 100, mermaPct: 0 }] });
  await put(`/products/${burrito}/sizes/${doble}/recipe`, { edges: [{ childType: 'ingredient', childId: carne, quantityNeta: 200, mermaPct: 0 }] });
  checkTrue('catálogo creado (producto con dos variantes y receta por variante)', !!(pan && carne && queso && burrito && pollo && doble));

  // ---- Compra: un solo lote por insumo, al precio que la ficha va a mostrar
  seccion('Compra inicial: pan $1.800, carne $30/g, queso $25/g');
  await post('/invoices/manual', {
    supplierNit: `901${STAMP}`, supplierName: N('Proveedor'), invoiceNumber: `CF-${STAMP}`, total: 180_000 + 300_000 + 50_000, freight: 0,
    items: [
      { entityType: 'INGREDIENT', ingredientId: pan, descriptionRaw: 'Pan', quantity: 100, unit: 'unidad', unitPrice: 1_800, total: 180_000 },
      { entityType: 'INGREDIENT', ingredientId: carne, descriptionRaw: 'Carne', quantity: 10, unit: 'kg', unitPrice: 30_000, total: 300_000 },
      { entityType: 'INGREDIENT', ingredientId: queso, descriptionRaw: 'Queso', quantity: 2, unit: 'kg', unitPrice: 25_000, total: 50_000 },
    ],
  });
  const BASE = 1_800 + 20 * 25; // 2.300
  const POLLO = BASE + 100 * 30; // 5.300
  const DOBLE = BASE + 200 * 30; // 8.300
  const costoBase = (await get(`/products/${burrito}/expanded-cost`)).body;
  const costoPollo = (await get(`/products/${burrito}/sizes/${pollo}/expanded-cost`)).body;
  const costoDoble = (await get(`/products/${burrito}/sizes/${doble}/expanded-cost`)).body;
  const conVariantes = (await get('/product-costs/with-variants')).body.find((c) => c.productId === burrito);
  check('costo hoy de la receta BASE (lo que la tabla muestra grande)', costoBase.totalCost, BASE);
  check('costo hoy de la variante Pollo', costoPollo.totalCost, POLLO);
  check('costo hoy de la variante Doble', costoDoble.totalCost, DOBLE);
  check('el batch de la tabla trae la variante Pollo igual', conVariantes?.variants.find((v) => v.sizeId === pollo)?.totalCost, POLLO);
  check('el batch de la tabla trae la variante Doble igual', conVariantes?.variants.find((v) => v.sizeId === doble)?.totalCost, DOBLE);

  // ---- Venta con variantes: movimientos = receta base + receta de la variante
  seccion('Venta: 1 Pollo + 1 Doble → los movimientos son exactamente la receta');
  const S0 = await estado();
  const stockCarne0 = await stock(carne);
  const vender = async (items) => {
    const s = (await post('/sales', { type: 'COUNTER', items }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).body;
    await post(`/sales/${s.id}/confirm-payment`, { method: 'CASH', amountReceived: Number(s.total) });
    return s;
  };
  const v1 = await vender([{ productId: burrito, quantity: 1, sizeId: pollo }, { productId: burrito, quantity: 1, sizeId: doble }]);
  check('cobra 23.000 + 25.000', Number(v1.total), 48_000);
  const c1 = await consumo('sale', v1.id);
  check('pan: −2 (uno por burrito)', c1.out.get(N('Pan')), -2);
  check('queso: −40 g (20 por burrito)', c1.out.get(N('Queso')), -40);
  check('carne: −300 g (100 del Pollo + 200 del Doble)', c1.out.get(N('Carne')), -300);
  checkTrue('todos los movimientos de la venta son de tipo Venta', c1.rows.every((m) => m.type === 'SALE'), JSON.stringify(c1.rows.map((m) => m.type)));
  check('el stock de carne bajó 300 g en el acto', (await stock(carne)) - stockCarne0, -300);
  const S1 = await estadoCuando((s) => delta(S0, s, 'cogs') > 0);
  check('COGS del mes sube 5.300 + 8.300 (cada variante a su costo)', delta(S0, S1, 'cogs'), POLLO + DOBLE);
  const m1 = await margen(burrito);
  check('reporte de margen: 2 unidades', m1?.unitsSold, 2);
  check('reporte de margen: COGS = 13.600 → "costo real / u" = 6.800 (promedio de lo VENDIDO, no la base de 2.300)', m1?.cogs, POLLO + DOBLE);
  checkTrue('el costo real no está marcado parcial (todo salió de lotes con precio)', m1?.cogsPartial === false, String(m1?.cogsPartial));

  // ---- Cortesía del mismo plato: mismos movimientos, tres costos iguales
  seccion('Cortesía: 1 Burrito Doble → guardado, FIFO y hoy dicen lo mismo, y descuenta igual que la venta');
  const cort = (await post('/cortesias', { productId: burrito, sizeId: doble, quantity: 1, reason: 'Auditoría de costos' }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).body;
  const c2 = await consumo('cortesia', cort.id);
  check('cortesía: pan −1', c2.out.get(N('Pan')), -1);
  check('cortesía: queso −20 g', c2.out.get(N('Queso')), -20);
  check('cortesía: carne −200 g (variante Doble)', c2.out.get(N('Carne')), -200);
  console.log(`    (los movimientos de la cortesía se guardan con tipo "${c2.rows[0]?.type}" y origen "${c2.rows[0]?.sourceType}": en la tabla de movimientos se leen como "Ajuste manual")`);
  check('costo guardado al crear = costo hoy de la variante', Number(cort.costAmount), DOBLE);
  const S2 = await estadoCuando((s) => delta(S1, s, 'cortesiasCost') > 0);
  check('el estado del mes suma la cortesía a FIFO = 8.300', delta(S1, S2, 'cortesiasCost'), DOBLE);
  check('la cortesía no toca el COGS de lo vendido', delta(S1, S2, 'cogs'), 0);
  const enLista = (await get('/cortesias?status=APPROVED')).body.find((c) => c.id === cort.id);
  check('en la lista, el FIFO de la cortesía = 8.300', enLista?.fifoCost, DOBLE);
  checkTrue('y no está marcado como estimado', enLista?.fifoCostEstimated === false, String(enLista?.fifoCostEstimated));
  check('precio regalado = base + recargo de la variante', Number(cort.salePrice), 25_000);

  // ---- Cambio de precio: "hoy" se mueve, el FIFO sigue en el lote viejo
  seccion('Sube la carne a $40/g: el costo HOY cambia ya; el costo REAL sigue saliendo del lote viejo');
  await post('/invoices/manual', {
    supplierNit: `901${STAMP}`, supplierName: N('Proveedor'), invoiceNumber: `CF2-${STAMP}`, total: 200_000, freight: 0,
    items: [{ entityType: 'INGREDIENT', ingredientId: carne, descriptionRaw: 'Carne', quantity: 5, unit: 'kg', unitPrice: 40_000, total: 200_000 }],
  });
  const DOBLE_HOY = BASE + 200 * 40; // 10.300
  check('costo hoy de Doble pasa a 10.300', (await get(`/products/${burrito}/sizes/${doble}/expanded-cost`)).body.totalCost, DOBLE_HOY);
  await vender([{ productId: burrito, quantity: 1, sizeId: doble }]);
  const S3 = await estadoCuando((s) => delta(S2, s, 'cogs') > 0);
  check('pero la venta siguiente cuesta 8.300: la carne sale del lote de $30 (FIFO)', delta(S2, S3, 'cogs'), DOBLE);
  const m2 = await margen(burrito);
  check('reporte de margen: 3 unidades, COGS 21.900 → "real / u" 7.300 mientras "hoy" dice 10.300 para Doble', m2?.cogs, POLLO + DOBLE + DOBLE);
  const cort2 = (await post('/cortesias', { productId: burrito, sizeId: doble, quantity: 1, reason: 'Auditoría de costos, tras subir precio' }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).body;
  check('la cortesía GUARDA el costo de hoy (10.300)…', Number(cort2.costAmount), DOBLE_HOY);
  const S4 = await estadoCuando((s) => delta(S3, s, 'cortesiasCost') > 0);
  check('…pero el estado y la lista la cobran a FIFO (8.300): por eso los dos números difieren', delta(S3, S4, 'cortesiasCost'), DOBLE);
  const enLista2 = (await get('/cortesias?status=APPROVED')).body.find((c) => c.id === cort2.id);
  check('lista: FIFO 8.300', enLista2?.fifoCost, DOBLE);

  // ---- Editar la receta después de vender
  seccion('Editar la receta DESPUÉS de vender: lo vendido no se reescribe; lo nuevo usa la receta nueva');
  await put(`/products/${burrito}/sizes/${pollo}/recipe`, { edges: [{ childType: 'ingredient', childId: carne, quantityNeta: 150, mermaPct: 0 }] });
  const c1b = await consumo('sale', v1.id);
  check('la venta vieja sigue con carne −300 g (no se reescribe el pasado)', c1b.out.get(N('Carne')), -300);
  await dormir(TTL_MS + 3_000);
  const S5 = await estado();
  check('y su COGS no cambia', delta(S4, S5, 'cogs'), 0);
  const v3 = await vender([{ productId: burrito, quantity: 1, sizeId: pollo }]);
  const c3 = await consumo('sale', v3.id);
  check('la venta nueva de Pollo descuenta 150 g (receta nueva)', c3.out.get(N('Carne')), -150);
  const S6 = await estadoCuando((s) => delta(S5, s, 'cogs') > 0);
  check('y cuesta 2.300 + 150 × 30 = 6.800 (lote viejo)', delta(S5, S6, 'cogs'), BASE + 150 * 30);

  // ---- Merma: stock, movimiento, estado, uso, anulación
  seccion('Merma de 500 g de carne: stock, movimiento, estado del mes, reporte de uso, y su anulación parcial');
  const stockCarne1 = await stock(carne);
  const merma = (await post('/inventory/movements', { entityType: 'INGREDIENT', ingredientId: carne, delta: -500, type: 'WASTE', notes: 'Auditoría: merma' })).body;
  check('el stock baja 500 g en el acto', (await stock(carne)) - stockCarne1, -500);
  checkTrue('el movimiento queda como Merma (WASTE)', merma.type === 'WASTE', merma.type);
  const S7 = await estadoCuando((s) => delta(S6, s, 'wasteCost') > 0);
  check('el estado del mes suma 500 × $30 = 15.000 de merma (lote viejo, el más antiguo)', delta(S6, S7, 'wasteCost'), 15_000);
  check('la merma NO toca el COGS de lo vendido', delta(S6, S7, 'cogs'), 0);
  check('ni las cortesías', delta(S6, S7, 'cortesiasCost'), 0);
  const uso1 = (await get(`/reports/inventory-usage?from=${ymd(hoy)}&to=${ymd(hoy)}`)).body.rows.find((r) => r.entityId === carne);
  check('reporte de uso: merma de 500 g', Math.abs(Number(uso1?.waste ?? 0)), 500);
  check('reporte de uso: la merma vale lo mismo que en el estado (15.000)', uso1?.wasteCost, 15_000);
  checkTrue('reporte de uso: no estimada', uso1?.wasteCostEstimated === false, String(uso1?.wasteCostEstimated));
  const rev = (await post(`/inventory/movements/${merma.id}/reverse-waste`, { quantity: 200, reason: 'Auditoría: se tecleó de más' })).body;
  check('la anulación parcial devuelve 200 g', Number(rev.delta), 200);
  checkTrue('y apunta a la merma original', rev.sourceType === 'waste_reversal' && rev.sourceId === merma.id, `${rev.sourceType} ${rev.sourceId}`);
  check('el stock vuelve a subir 200 g', (await stock(carne)) - stockCarne1, -300);
  const S8 = await estadoCuando((s) => delta(S7, s, 'wasteCost') < 0);
  check('el estado descuenta 200 × $30 = 6.000 de la merma', delta(S7, S8, 'wasteCost'), -6_000);
  const uso2 = (await get(`/reports/inventory-usage?from=${ymd(hoy)}&to=${ymd(hoy)}`)).body.rows.find((r) => r.entityId === carne);
  check('reporte de uso: merma neta 300 g', Math.abs(Number(uso2?.waste ?? 0)), 300);
  check('reporte de uso: 9.000, igual que el estado', uso2?.wasteCost, 9_000);
  const demas = await api('POST', `/inventory/movements/${merma.id}/reverse-waste`, { quantity: 400, reason: 'Auditoría: más de lo mermado' });
  checkTrue('anular más de lo que queda (400 de 300) se rechaza', demas.status === 400, `status ${demas.status}`);

  // ---- Merma de algo que nunca tuvo precio: costo desconocido, no cero
  seccion('Merma de un insumo sin ninguna compra: el sistema dice "sin costo", no $0 disfrazado');
  const cilantro = (await post('/ingredients', { name: N('Cilantro'), unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000, thresholdMin: 0, isActive: true })).body.id;
  const inicial = (await post('/inventory/movements', { entityType: 'INGREDIENT', ingredientId: cilantro, delta: 100, type: 'INITIAL', notes: 'Auditoría: sin precio' })).body;
  checkTrue('la carga inicial sin precio entra SIN costo (no hay con qué estimar)', inicial.unitCost === null, String(inicial.unitCost));
  await post('/inventory/movements', { entityType: 'INGREDIENT', ingredientId: cilantro, delta: -10, type: 'WASTE', notes: 'Auditoría: merma sin precio' });
  await dormir(TTL_MS + 3_000);
  const S9 = await estado();
  check('esa merma NO suma al estado (no tiene costo con qué valorizarse)', delta(S8, S9, 'wasteCost'), 0);
  const uso3 = (await get(`/reports/inventory-usage?from=${ymd(hoy)}&to=${ymd(hoy)}`)).body;
  const filaCil = uso3.rows.find((r) => r.entityId === cilantro);
  checkTrue('el reporte de uso la muestra sin valorizar (no $0)', filaCil && filaCil.wasteCost === null, JSON.stringify({ waste: filaCil?.waste, wasteCost: filaCil?.wasteCost }));
  checkTrue('y cuenta el ítem entre los que no se pudieron valorizar', Number(uso3.unknownCostCount) >= 1, String(uso3.unknownCostCount));

  // ---- Sobrante de conteo tras el cambio de precio (Fase 2)
  seccion('Sobrante de conteo: entra al último precio ($40/g) y marcado estimado');
  const stockCarne2 = await stock(carne);
  const conteo = (await post('/inventory/counts', { entityType: 'INGREDIENT', ingredientId: carne, countedQty: stockCarne2 + 50, notes: 'Auditoría: sobrante' })).body;
  if (conteo.status === 'PENDING') await post(`/inventory/counts/${conteo.id}/approve`, {});
  const ajuste = (await get(`/inventory/movements?source_type=stock_count&source_id=${conteo.id}`)).body[0];
  check('el sobrante entra a $40/g (último precio de compra)', Number(ajuste?.unitCost), 40);
  checkTrue('y queda marcado estimado', ajuste?.unitCostEstimated === true, String(ajuste?.unitCostEstimated));

  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${'='.repeat(70)}\n${resultados.length - fallos.length} de ${resultados.length} comprobaciones en verde${fallos.length ? `, ${fallos.length} en rojo:` : '.'}`);
  for (const f of fallos) console.log(`  ✗ [${f.seccion}] ${f.nombre}: esperado ${fmt(f.esperado)}, llegó ${fmt(f.actual)}`);
  console.log(`Escenario creado con sufijo CF${STAMP}.`);
  process.exit(fallos.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nLa auditoría se detuvo: ${e.message}`);
  process.exit(1);
});
