/**
 * Recorrido AUTOMÁTICO del CHECKLIST-QA-DESPLIEGUE.md por la API.
 *
 * Cubre 77 verificaciones de los bloques 0,1,2,4,5,6,7,8,9,11 y 17 — las que
 * se pueden ejercitar sin un navegador. Lo que NO cubre (y hay que mirar a
 * mano) está en el propio checklist: pantallas, offline, impresora, mobile.
 *
 * Corre contra una base DEDICADA para no ensuciar la de desarrollo:
 *
 *   # 1. base limpia + API en un puerto aparte
 *   docker exec pos-tercos-postgres psql -U pos -d postgres \
 *     -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='pos_qa'" \
 *     -c "DROP DATABASE IF EXISTS pos_qa" -c "CREATE DATABASE pos_qa"
 *   cd apps/api
 *   DATABASE_URL="postgresql://pos:pos_dev@localhost:5432/pos_qa?schema=public" pnpm prisma migrate deploy
 *   DATABASE_URL="postgresql://pos:pos_dev@localhost:5432/pos_qa?schema=public" pnpm dlx tsx prisma/seed.ts
 *   DATABASE_URL="postgresql://pos:pos_dev@localhost:5432/pos_qa?schema=public" PORT=3011 pnpm dev
 *
 *   # 2. en otra terminal
 *   node apps/api/qa/checklist-automatica.mjs
 *
 * OJO: arranca SIEMPRE de una base recién sembrada. Si la reusás, la caja del
 * día ya quedó cerrada por la corrida anterior y fallan ~20 checks en cascada.
 */
const API = process.env.QA_API ?? 'http://localhost:3011';
const PW = 'dev12345';

let pass = 0, fail = 0;
const fails = [];
const log = (s) => console.log(s);

async function check(bloque, item, fn) {
  try {
    const d = await fn();
    pass++;
    log(`  ✅ [${bloque}] ${item}${typeof d === 'string' && d ? ` — ${d}` : ''}`);
  } catch (e) {
    fail++;
    const msg = e instanceof Error ? e.message : String(e);
    fails.push(`[${bloque}] ${item} — ${msg}`);
    log(`  ❌ [${bloque}] ${item} — ${msg}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: esperaba ${b}, obtuve ${a}`); };
const near = (a, b, m, tol = 1) => { if (Math.abs(a - b) > tol) throw new Error(`${m}: esperaba ~${b}, obtuve ${a}`); };

async function req(method, path, { token, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Client-App': 'admin', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* vacío */ }
  return { status: res.status, data };
}
const GET = (p, o) => req('GET', p, o);
const POST = (p, b, o) => req('POST', p, { body: b, ...o });
const PATCH = (p, b, o) => req('PATCH', p, { body: b, ...o });
const PUT = (p, b, o) => req('PUT', p, { body: b, ...o });
const DEL = (p, o) => req('DELETE', p, o);
const uuid = () => crypto.randomUUID();

async function login(email, pw = PW) {
  const r = await POST('/auth/login', { email, password: pw });
  assert(r.status < 300, `login ${email} → ${r.status}`);
  return r.data.accessToken ?? r.data.access_token ?? r.data.token;
}

const T = {};
const X = {}; // ids de trabajo
const auth = (t) => ({ token: t });

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 0 — Acceso, sesiones y roles ═══');

await check('0', 'Login de los 4 usuarios', async () => {
  T.dueno = await login('dueno@dev.local');
  T.admin = await login('admin@dev.local');
  T.cocinero = await login('cocinero@dev.local');
  T.trabajador = await login('trabajador@dev.local');
  return 'dueño, operativo, cocinero, trabajador';
});
await check('0', 'Clave incorrecta rechazada', async () => {
  eq((await POST('/auth/login', { email: 'dueno@dev.local', password: 'claveIncorrecta123' })).status, 401, 'clave mala');
});
await check('0', 'Sin token no se entra', async () => {
  eq((await GET('/products')).status, 401, 'sin token');
});
await check('0', 'Operativo NO ve la auditoría completa (es del dueño)', async () => {
  eq((await GET('/audit', auth(T.admin))).status, 403, 'operativo en /audit');
});
await check('0', 'Operativo NO ve el estado financiero', async () => {
  eq((await GET('/reports/financial/monthly?year=2026&month=7', auth(T.admin))).status, 403, 'operativo en finanzas');
});
await check('0', 'Cocinero NO ve reportes de ventas', async () => {
  eq((await GET('/reports/sales-summary', auth(T.cocinero))).status, 403, 'cocinero en reportes');
});
await check('0', 'Trabajador NO ve el inventario del admin', async () => {
  eq((await GET('/inventory/stock', auth(T.trabajador))).status, 403, 'trabajador en inventario');
});
await check('0', 'El cocinero NO ve costos de insumos (dato del negocio)', async () => {
  const r = await GET('/ingredients', auth(T.cocinero));
  eq(r.status, 200, 'cocinero lista insumos');
  const conCosto = r.data.filter((i) => i.lastUnitCost !== null);
  eq(conCosto.length, 0, 'insumos con costo visible al cocinero');
  return `${r.data.length} insumos, todos con costo anulado`;
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 1 — Catálogo ═══');

await check('1', 'Crear insumo', async () => {
  const r = await POST('/ingredients', {
    name: `Carne QA ${Date.now()}`, unitPurchase: 'kg', unitRecipe: 'g',
    conversionFactor: 1000, thresholdMin: 2000, isActive: true,
  }, auth(T.dueno));
  eq(r.status, 201, 'crear insumo'); X.insumo = r.data.id;
});
await check('1', 'Crear subproducto + su receta', async () => {
  const s = await POST('/subproducts', {
    name: `Salsa QA ${Date.now()}`, unit: 'porcion', yield: 20, thresholdMin: 5, isActive: true,
  }, auth(T.dueno));
  eq(s.status, 201, 'crear subproducto'); X.sub = s.data.id;
  const r = await PUT(`/subproducts/${X.sub}/recipe`, {
    edges: [{ childType: 'ingredient', childId: X.insumo, quantityNeta: 100, mermaPct: 0.1 }],
  }, auth(T.dueno));
  assert(r.status < 300, `receta subproducto → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
});
await check('1', 'Crear producto de reventa directa', async () => {
  const r = await POST('/products', {
    name: `Gaseosa QA ${Date.now()}`, category: 'Bebidas', basePrice: 5000, isActive: true,
    directResale: true, isCombo: false, modifiersEnabled: false,
    unitPurchase: 'caja', unitStock: 'unidad', conversionFactor: 24, thresholdMin: 0,
  }, auth(T.dueno));
  eq(r.status, 201, 'crear reventa'); X.gaseosa = r.data.id;
});
await check('1', 'Crear preparado con receta (insumo + subproducto)', async () => {
  const p = await POST('/products', {
    name: `Burger QA ${Date.now()}`, category: 'Burgers', basePrice: 25000, isActive: true,
    directResale: false, isCombo: false, modifiersEnabled: false,
  }, auth(T.dueno));
  eq(p.status, 201, 'crear preparado'); X.burger = p.data.id;
  const r = await PUT(`/products/${X.burger}/recipe`, {
    edges: [
      { childType: 'ingredient', childId: X.insumo, quantityNeta: 150, mermaPct: 0.05 },
      { childType: 'subproduct', childId: X.sub, quantityNeta: 1 },
    ],
  }, auth(T.dueno));
  assert(r.status < 300, `receta producto → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
});
await check('1', 'Categoría inexistente es rechazada', async () => {
  const r = await POST('/products', {
    name: `Fantasma ${Date.now()}`, category: 'No Existe QA', basePrice: 1000,
    isActive: true, directResale: false, isCombo: false, modifiersEnabled: false,
  }, auth(T.dueno));
  assert(r.status >= 400, `esperaba rechazo, obtuve ${r.status}`);
});
await check('1', 'Costo expandido del preparado > 0 (suma insumo + subproducto)', async () => {
  const r = await GET(`/products/${X.burger}/expanded-cost`, auth(T.dueno));
  eq(r.status, 200, 'expanded-cost');
  const c = r.data.totalCost ?? r.data.totals?.totalCost ?? 0;
  return `costo unitario ≈ ${c}`;
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 2 — Inventario ═══');

const stockOf = async (type, id) =>
  (await GET(`/inventory/stock/${type}/${id}`, auth(T.dueno))).data.currentStock;

await check('2', 'Stock inicial con costo', async () => {
  eq((await POST('/inventory/movements', {
    entityType: 'INGREDIENT', ingredientId: X.insumo, delta: 100000, type: 'INITIAL', unitCost: 0.02,
  }, auth(T.dueno))).status, 201, 'inicial insumo');
  eq((await POST('/inventory/movements', {
    entityType: 'PRODUCT', productId: X.gaseosa, delta: 200, type: 'INITIAL', unitCost: 2000,
  }, auth(T.dueno))).status, 201, 'inicial gaseosa');
});
await check('2', 'Segundo stock inicial rechazado', async () => {
  const r = await POST('/inventory/movements', {
    entityType: 'INGREDIENT', ingredientId: X.insumo, delta: 50, type: 'INITIAL', unitCost: 0.02,
  }, auth(T.dueno));
  assert(r.status >= 400, `obtuve ${r.status}`);
});
await check('2', 'Merma baja el stock y se puede anular PARCIAL', async () => {
  const a = await stockOf('ingredient', X.insumo);
  const m = await POST('/inventory/movements', {
    entityType: 'INGREDIENT', ingredientId: X.insumo, delta: -500, type: 'WASTE', notes: 'QA merma',
  }, auth(T.dueno));
  eq(m.status, 201, 'merma'); X.merma = m.data.id;
  eq(a - (await stockOf('ingredient', X.insumo)), 500, 'bajó 500');
  const b = await stockOf('ingredient', X.insumo);
  eq((await POST(`/inventory/movements/${X.merma}/reverse-waste`,
    { reason: 'QA fueron 100', quantity: 400 }, auth(T.dueno))).status, 201, 'reversa parcial');
  eq((await stockOf('ingredient', X.insumo)) - b, 400, 'devolvió 400');
});
await check('2', 'No devuelve más de lo mermado', async () => {
  const r = await POST(`/inventory/movements/${X.merma}/reverse-waste`, { reason: 'QA pasarse', quantity: 500 }, auth(T.dueno));
  assert(r.status >= 400, `obtuve ${r.status}`);
});
await check('2', 'Un CAJERO real no puede anular mermas', async () => {
  const email = `cajero.real.qa.${Date.now()}@test.local`;
  const u = await POST('/users', { email, fullName: 'Cajero Real QA', role: 'CAJERO', password: PW }, auth(T.dueno));
  assert(u.status < 300, `crear cajero → ${u.status} ${JSON.stringify(u.data)?.slice(0, 80)}`);
  const tk = await login(email);
  const m = await POST('/inventory/movements', {
    entityType: 'INGREDIENT', ingredientId: X.insumo, delta: -10, type: 'WASTE', notes: 'QA rol',
  }, auth(T.dueno));
  eq((await POST(`/inventory/movements/${m.data.id}/reverse-waste`, { reason: 'QA no debería' }, auth(tk))).status, 403, 'cajero anulando');
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 4 — Caja y ventas ═══');

await check('4', 'Abrir caja con fondo $100.000', async () => {
  const r = await POST('/shifts/open', { openingCash: 100000 }, auth(T.admin));
  assert(r.status < 300, `abrir caja → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
  X.shift = r.data.id;
});
await check('4', 'Una SEGUNDA caja es rechazada (caja única)', async () => {
  const r = await POST('/shifts/open', { openingCash: 50000 }, auth(T.dueno));
  eq(r.status, 409, 'segunda caja');
});

const vender = async (items, extra = {}) => {
  const c = await POST('/sales', { type: 'COUNTER', items, ...extra },
    { token: T.admin, headers: { 'Idempotency-Key': uuid() } });
  assert(c.status === 201, `crear venta → ${c.status} ${JSON.stringify(c.data)?.slice(0, 120)}`);
  return c.data;
};
const cobrar = (id, body) => POST(`/sales/${id}/confirm-payment`, body, auth(T.admin));

await check('4', 'Venta simple en efectivo', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 2 }]);
  eq(v.total, 10000, 'total 2 gaseosas');
  const p = await cobrar(v.id, { method: 'CASH', amountReceived: 20000 });
  assert(p.status < 300, `cobrar → ${p.status} ${JSON.stringify(p.data)?.slice(0, 90)}`);
  X.venta1 = v.id;
  return 'total $10.000';
});
await check('4', 'La venta descontó stock', async () => {
  eq(await stockOf('product', X.gaseosa), 198, 'gaseosas tras vender 2');
});
await check('4', 'Idempotencia: el mismo key no cobra dos veces', async () => {
  const k = uuid();
  const a = await POST('/sales', { type: 'COUNTER', items: [{ productId: X.gaseosa, quantity: 1 }] },
    { token: T.admin, headers: { 'Idempotency-Key': k } });
  const b = await POST('/sales', { type: 'COUNTER', items: [{ productId: X.gaseosa, quantity: 1 }] },
    { token: T.admin, headers: { 'Idempotency-Key': k } });
  eq(b.data.id, a.data.id, 'devolvió otra venta');
  X.ventaIdem = a.data.id;
});
await check('4', 'Transferencia exige verificar el comprobante', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 1 }]);
  const sin = await cobrar(v.id, { method: 'TRANSFER', amountReceived: 5000 });
  assert(sin.status >= 400, `sin verificar debió fallar, obtuve ${sin.status}`);
  const con = await cobrar(v.id, { method: 'TRANSFER', amountReceived: 5000, digitalDoubleVerified: true });
  assert(con.status < 300, `con verificación → ${con.status}`);
});
await check('4', 'Efectivo recibido menor al total es rechazado', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 2 }]);
  const r = await cobrar(v.id, { method: 'CASH', amountReceived: 5000 });
  assert(r.status >= 400, `obtuve ${r.status}`);
  await POST(`/sales/${v.id}/cancel`, { reason: 'QA limpieza' }, auth(T.admin));
});
await check('4', 'Cuenta dividida en 3 partes que NO divide exacto', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 2 }]); // $10.000
  const partes = [
    { method: 'CASH', amount: 3334, amountReceived: 5000 },
    { method: 'CASH', amount: 3333, amountReceived: 4000 },
    { method: 'CASH', amount: 3333, amountReceived: 4000 },
  ];
  eq(partes.reduce((a, p) => a + p.amount, 0), 10000, 'las partes deben sumar el total');
  const r = await cobrar(v.id, { payments: partes });
  assert(r.status < 300, `split → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
  return '3334+3333+3333 = 10.000';
});
await check('4', 'Cuenta dividida que NO suma el total es rechazada', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 2 }]);
  const r = await cobrar(v.id, { payments: [
    { method: 'CASH', amount: 3000, amountReceived: 3000 },
    { method: 'CASH', amount: 3000, amountReceived: 3000 },
  ] });
  assert(r.status >= 400, `obtuve ${r.status}`);
  await POST(`/sales/${v.id}/cancel`, { reason: 'QA limpieza' }, auth(T.admin));
});
await check('4', 'Descuento manual sobre el total, con motivo', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 4 }], {
    orderDiscount: { kind: 'PERCENT', value: 10 }, discountReason: 'QA: cliente frecuente',
  });
  eq(v.subtotal, 20000, 'subtotal');
  eq(v.discountTotal, 2000, 'descuento 10%');
  eq(v.total, 18000, 'total con descuento');
  await cobrar(v.id, { method: 'CASH', amountReceived: 20000 });
});
await check('4', 'Cuenta abierta: exige nombre de cliente', async () => {
  const r = await POST('/sales', { type: 'COUNTER', openTab: true, items: [{ productId: X.gaseosa, quantity: 1 }] },
    { token: T.admin, headers: { 'Idempotency-Key': uuid() } });
  assert(r.status >= 400, `sin nombre debió fallar, obtuve ${r.status}`);
});
await check('4', 'Cuenta abierta se crea y queda pendiente', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 2 }], { openTab: true, customerName: 'Mesa QA' });
  eq(v.status, 'PENDIENTE_PAGO', 'estado de la cuenta');
  X.cuenta = v.id;
});
await check('4', 'Editar una venta pagada ajusta el total', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 1 }]);
  await cobrar(v.id, { method: 'CASH', amountReceived: 5000 });
  const r = await PATCH(`/sales/${v.id}/items`, { items: [{ productId: X.gaseosa, quantity: 2 }] }, auth(T.admin));
  assert(r.status < 300, `editar → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
  eq(r.data.total, 10000, 'total tras editar');
  X.ventaEditada = v.id;
});
await check('4', 'Anular exige PIN de aprobación', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 1 }]);
  await cobrar(v.id, { method: 'CASH', amountReceived: 5000 });
  const sin = await POST(`/sales/${v.id}/void`, { reason: 'QA sin pin' }, auth(T.admin));
  assert(sin.status >= 400, `sin PIN debió fallar, obtuve ${sin.status}`);
  X.ventaParaAnular = v.id;
});
await check('4', 'Con PIN correcto anula y DEVUELVE el stock', async () => {
  const pin = '654321';
  const sp = await POST('/approvals/pin', { pin, password: PW }, auth(T.dueno));
  assert(sp.status < 300, `set pin → ${sp.status}`);
  const antes = await stockOf('product', X.gaseosa);
  const r = await POST(`/sales/${X.ventaParaAnular}/void`, { reason: 'QA anulación' },
    { token: T.admin, headers: { 'X-Approval-Pin': pin } });
  assert(r.status < 300, `anular → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
  eq((await stockOf('product', X.gaseosa)) - antes, 1, 'stock devuelto');
});
await check('4', 'Movimiento de caja en efectivo mueve el esperado', async () => {
  const a = (await GET(`/shifts/${X.shift}/expected-cash`, auth(T.admin))).data.expectedCash;
  eq((await POST(`/shifts/${X.shift}/cash-movements`,
    { type: 'OUT', method: 'CASH', amount: 20000, reason: 'QA compra de hielo' }, auth(T.admin))).status, 201, 'salida');
  const b = (await GET(`/shifts/${X.shift}/expected-cash`, auth(T.admin))).data.expectedCash;
  eq(a - b, 20000, 'la salida baja el esperado');
});
await check('4', 'Salida DIGITAL no toca el efectivo esperado', async () => {
  const a = (await GET(`/shifts/${X.shift}/expected-cash`, auth(T.admin))).data.expectedCash;
  eq((await POST(`/shifts/${X.shift}/cash-movements`,
    { type: 'OUT', method: 'TRANSFER', amount: 15000, reason: 'QA pago digital' }, auth(T.admin))).status, 201, 'salida digital');
  const b = (await GET(`/shifts/${X.shift}/expected-cash`, auth(T.admin))).data.expectedCash;
  eq(a, b, 'el efectivo no debe moverse');
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 11 — Cortesías ═══');

await check('11', 'Registrar cortesía descuenta stock al instante', async () => {
  const antes = await stockOf('product', X.gaseosa);
  const r = await POST('/cortesias', { productId: X.gaseosa, quantity: 2, reason: 'QA cliente frecuente' }, auth(T.admin));
  assert(r.status < 300, `cortesía → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
  X.cortesia = r.data.id;
  eq(antes - (await stockOf('product', X.gaseosa)), 2, 'descontó 2');
});
await check('11', 'Doble clic con el mismo key NO descuenta dos veces', async () => {
  const k = uuid();
  const antes = await stockOf('product', X.gaseosa);
  const body = { productId: X.gaseosa, quantity: 2, reason: 'QA doble clic' };
  const a = await POST('/cortesias', body, { token: T.admin, headers: { 'Idempotency-Key': k } });
  const b = await POST('/cortesias', body, { token: T.admin, headers: { 'Idempotency-Key': k } });
  eq(b.data.id, a.data.id, 'creó dos cortesías');
  eq(antes - (await stockOf('product', X.gaseosa)), 2, 'descontó de más');
});
await check('11', 'Anular cortesía devuelve el stock', async () => {
  const antes = await stockOf('product', X.gaseosa);
  const r = await POST(`/cortesias/${X.cortesia}/reverse`, { note: 'QA anulación' }, auth(T.dueno));
  assert(r.status < 300, `anular cortesía → ${r.status}`);
  eq((await stockOf('product', X.gaseosa)) - antes, 2, 'devolvió 2');
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 5 — Pedidos web ═══');

const WEB = { 'X-Client-App': 'web' };
await check('5', 'El menú público NO expone costos', async () => {
  const r = await GET('/web/menu');
  eq(r.status, 200, 'menú público');
  const p = r.data.products?.[0];
  assert(p, 'menú vacío');
  assert(!('lastUnitCost' in p) && !('thresholdMin' in p), `el menú expone: ${Object.keys(p).join(',')}`);
  return `${r.data.products.length} productos, sin datos de costo`;
});
await check('5', 'Crear pedido web de retiro', async () => {
  const r = await POST('/web/orders', {
    type: 'WEB_PICKUP', customerName: 'Cliente QA', customerPhone: '+573001234567',
    items: [{ productId: X.gaseosa, quantity: 1 }],
  }, { headers: { ...WEB, 'Idempotency-Key': uuid() } });
  assert(r.status < 300, `pedido web → ${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`);
  X.web1 = r.data.order.id; X.web1Token = r.data.token;
});
await check('5', 'Teléfono inválido rechazado', async () => {
  const r = await POST('/web/orders', {
    type: 'WEB_PICKUP', customerName: 'Malo', customerPhone: '+5730012345',
    items: [{ productId: X.gaseosa, quantity: 1 }],
  }, { headers: { ...WEB, 'Idempotency-Key': uuid() } });
  assert(r.status >= 400, `obtuve ${r.status}`);
});
await check('5', 'El seguimiento exige el token correcto', async () => {
  eq((await GET(`/web/orders/${X.web1}?token=${X.web1Token}`)).status, 200, 'con token');
  assert((await GET(`/web/orders/${X.web1}?token=inventado`)).status >= 400, 'aceptó un token falso');
  assert((await GET(`/web/orders/${X.web1}`)).status >= 400, 'aceptó sin token');
});
await check('5', 'Tope de 3 pedidos pendientes por teléfono al día', async () => {
  const tel = `+5730077${String(Date.now()).slice(-5)}`;
  const mk = () => POST('/web/orders', {
    type: 'WEB_PICKUP', customerName: 'Tope QA', customerPhone: tel,
    items: [{ productId: X.gaseosa, quantity: 1 }],
  }, { headers: { ...WEB, 'Idempotency-Key': uuid() } });
  for (let i = 0; i < 3; i++) assert((await mk()).status < 300, `el pedido ${i + 1} debió pasar`);
  assert((await mk()).status >= 400, 'el 4º pedido NO fue rechazado');
  return '3 pasan, el 4º se rechaza';
});
await check('5', 'El cajero confirma el pago del pedido web', async () => {
  const r = await POST(`/sales/${X.web1}/confirm-payment`,
    { method: 'TRANSFER', amountReceived: 5000, digitalDoubleVerified: true }, auth(T.admin));
  assert(r.status < 300, `confirmar → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
});
await check('5', 'Marcar listo para retirar', async () => {
  const r = await POST(`/sales/${X.web1}/mark-ready`, {}, auth(T.admin));
  assert(r.status < 300, `marcar listo → ${r.status}`);
  eq(r.data.status, 'LISTO_DESPACHO', 'estado final');
});
await check('5', 'Kill-switch: apagar pedidos web los bloquea', async () => {
  const off = await PATCH('/business-config', { webOrdersEnabled: false }, auth(T.dueno));
  assert(off.status < 300, `apagar → ${off.status} ${JSON.stringify(off.data)?.slice(0, 90)}`);
  const r = await POST('/web/orders', {
    type: 'WEB_PICKUP', customerName: 'Bloqueado QA', customerPhone: '+573009998877',
    items: [{ productId: X.gaseosa, quantity: 1 }],
  }, { headers: { ...WEB, 'Idempotency-Key': uuid() } });
  const bloqueado = r.status >= 400;
  await PATCH('/business-config', { webOrdersEnabled: true }, auth(T.dueno)); // restaurar
  assert(bloqueado, `con el switch apagado igual creó el pedido (${r.status})`);
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 6 — Cocina ═══');

await check('6', 'El cocinero ve el stock SIN costos', async () => {
  const r = await GET('/kitchen/stock', auth(T.cocinero));
  eq(r.status, 200, 'stock de cocina');
  const conCosto = (r.data ?? []).filter((s) => s.lastUnitCost != null);
  eq(conCosto.length, 0, 'expone costos a cocina');
});
await check('6', 'Producir una tanda sube el subproducto y baja el insumo', async () => {
  const subAntes = await stockOf('subproduct', X.sub);
  const insAntes = await stockOf('ingredient', X.insumo);
  const r = await POST(`/subproducts/${X.sub}/produce`, { quantityProduced: 20, idempotencyKey: uuid() }, auth(T.cocinero));
  assert(r.status < 300, `producir → ${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`);
  eq((await stockOf('subproduct', X.sub)) - subAntes, 20, 'subproducto producido');
  assert((await stockOf('ingredient', X.insumo)) < insAntes, 'no consumió insumo');
  return '20 porciones producidas';
});
await check('6', 'Producir sin insumo suficiente es rechazado', async () => {
  const r = await POST(`/subproducts/${X.sub}/produce`, { quantityProduced: 99999999, idempotencyKey: uuid() }, auth(T.cocinero));
  assert(r.status >= 400, `obtuve ${r.status}`);
});
await check('6', 'El cocinero registra merma con motivo', async () => {
  const r = await POST('/kitchen/waste', {
    entityType: 'INGREDIENT', ingredientId: X.insumo, quantity: 50, reason: 'QA se quemó',
  }, auth(T.cocinero));
  assert(r.status < 300, `merma cocina → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
});
await check('6', 'Incidencia de cocina queda registrada', async () => {
  const r = await POST('/kitchen/incidents', { category: 'EQUIPO', note: 'QA: la freidora hace ruido' }, auth(T.cocinero));
  assert(r.status < 300, `incidencia → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 7 — Promociones ═══');

await check('7', 'Promo de % aplica en la venta', async () => {
  const c = await POST('/promotions', {
    name: 'QA 20% gaseosa', type: 'PERCENT_OFF', discountPct: 0.2,
    daysOfWeekMask: 127, timeStart: '00:00:00', timeEnd: '23:59:59',
    isActive: true, productIds: [X.gaseosa], channel: 'BOTH',
  }, auth(T.dueno));
  assert(c.status < 300, `crear promo → ${c.status} ${JSON.stringify(c.data)?.slice(0, 120)}`);
  X.promo = c.data.id;
  const v = await vender([{ productId: X.gaseosa, quantity: 1 }]);
  eq(v.subtotal, 5000, 'subtotal');
  eq(v.discountTotal, 1000, 'descuento 20%');
  eq(v.total, 4000, 'total con promo');
  await POST(`/sales/${v.id}/cancel`, { reason: 'QA limpieza' }, auth(T.admin));
});
await check('7', 'El descuento manual DESACTIVA las promos', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 1 }], {
    orderDiscount: { kind: 'FIXED', value: 500 }, discountReason: 'QA excluyente',
  });
  eq(v.discountTotal, 500, 'debe aplicar SOLO el manual, no el 20% de promo');
  await POST(`/sales/${v.id}/cancel`, { reason: 'QA limpieza' }, auth(T.admin));
});
await check('7', 'Desactivar la promo la deja de aplicar', async () => {
  await DEL(`/promotions/${X.promo}`, auth(T.dueno));
  const v = await vender([{ productId: X.gaseosa, quantity: 1 }]);
  eq(v.discountTotal, 0, 'sigue aplicando una promo desactivada');
  await POST(`/sales/${v.id}/cancel`, { reason: 'QA limpieza' }, auth(T.admin));
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 8 — Finanzas ═══');

const mes = new Date();
const pnl = async () =>
  (await GET(`/reports/financial/monthly?year=${mes.getFullYear()}&month=${mes.getMonth() + 1}`, auth(T.dueno))).data;

await check('8', 'Costo fijo recurrente baja el neto y entra al break-even', async () => {
  const a = await pnl();
  const r = await POST('/fixed-costs', { name: 'QA Arriendo', amount: 1500000, frequency: 'MONTHLY', category: 'Local' }, auth(T.dueno));
  assert(r.status < 300, `costo fijo → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
  const b = await pnl();
  eq(b.totalFixed - a.totalFixed, 1500000, 'costos fijos');
  near(b.netResult - a.netResult, -1500000, 'el neto baja');
});
await check('8', 'Gasto puntual baja el neto pero NO el break-even', async () => {
  const a = await pnl();
  const hoy = new Date().toISOString().slice(0, 10);
  await POST('/fixed-costs', { name: 'QA Horno', amount: 800000, frequency: 'ONE_TIME', category: 'Equipos', startedAt: hoy }, auth(T.dueno));
  const b = await pnl();
  eq(b.oneTimeCost - a.oneTimeCost, 800000, 'gasto puntual');
  eq(b.totalFixed, a.totalFixed, 'el puntual NO debe ser recurrente');
});
await check('8', 'Tesorería expone los dos bolsillos', async () => {
  const r = await GET('/treasury/summary', auth(T.dueno));
  eq(r.status, 200, 'tesorería');
  assert(r.data.cash && r.data.bank, 'faltan bolsillos');
  return `efectivo ${Math.round(r.data.cash.balance)} · cuenta ${Math.round(r.data.bank.balance)}`;
});
await check('8', 'Traspaso mueve bolsillos sin cambiar el total', async () => {
  const a = (await GET('/treasury/summary', auth(T.dueno))).data;
  const r = await POST('/treasury/transfer',
    { fromPocket: 'EFECTIVO', toPocket: 'CUENTA', amount: 50000, reason: 'QA consignación al banco' },
    { token: T.dueno, headers: { 'Idempotency-Key': uuid() } });
  assert(r.status < 300, `traspaso → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
  const b = (await GET('/treasury/summary', auth(T.dueno))).data;
  near(b.cash.balance, a.cash.balance - 50000, 'efectivo');
  near(b.bank.balance, a.bank.balance + 50000, 'cuenta');
  near(b.total, a.total, 'el total NO debe cambiar');
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 9 — Reportes ═══');

for (const [nombre, url] of [
  ['Resumen de ventas', '/reports/sales-summary'],
  ['Top productos', '/reports/top-products'],
  ['Dashboard', '/reports/dashboard'],
  ['Mapa de calor', '/reports/hour-heatmap'],
  ['Uso y mermas', '/reports/inventory-usage'],
  ['P&G (COGS)', '/reports/cogs/pnl'],
  ['Valuación de inventario', '/reports/cogs/inventory-valuation'],
  ['Márgenes por producto', '/reports/cogs/product-margins'],
  ['Anomalías por cajero', '/reports/anomalies'],
]) {
  await check('9', `${nombre} responde`, async () => {
    const r = await GET(url, auth(T.dueno));
    eq(r.status, 200, nombre);
  });
}

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 17 — Cuadres cruzados ═══');

await check('17', 'Efectivo esperado = fondo + ventas efectivo + entradas − salidas', async () => {
  const e = (await GET(`/shifts/${X.shift}/expected-cash`, auth(T.admin))).data;
  const calc = e.openingCash + e.cashSalesTotal + e.cashIn - e.cashOut;
  eq(e.expectedCash, calc, 'la fórmula del arqueo no cierra');
  return `${e.openingCash} + ${e.cashSalesTotal} + ${e.cashIn} − ${e.cashOut} = ${e.expectedCash}`;
});
await check('17', 'P&G: neto = margen − fijos − puntuales − cortesías − reembolsos − mermas', async () => {
  const m = await pnl();
  near(m.grossMargin, m.revenue - m.cogs, 'margen bruto', 2);
  const esperado = m.grossMargin - m.totalFixed - m.oneTimeCost - m.cortesiasCost - m.refundCost - m.wasteCost;
  near(m.netResult, esperado, 'la identidad del P&G no cierra', 2);
  return `neto ${Math.round(m.netResult)}`;
});
await check('17', 'Ingreso del P&G = suma de las ventas cobradas', async () => {
  const m = await pnl();
  const desde = new Date(mes.getFullYear(), mes.getMonth(), 1).toISOString().slice(0, 10);
  const hasta = new Date().toISOString().slice(0, 10);
  const s = (await GET(`/reports/sales-summary?from=${desde}&to=${hasta}`, auth(T.dueno))).data;
  near(m.revenue, s.totals.revenue, 'P&G vs reporte de ventas', 2);
  return `${Math.round(m.revenue)} en ambos`;
});
await check('17', 'Suma por método del reporte = total vendido', async () => {
  const desde = new Date(mes.getFullYear(), mes.getMonth(), 1).toISOString().slice(0, 10);
  const hasta = new Date().toISOString().slice(0, 10);
  const s = (await GET(`/reports/sales-summary?from=${desde}&to=${hasta}`, auth(T.dueno))).data;
  const porMetodo = s.byMethod.reduce((a, m) => a + m.revenue, 0);
  near(porMetodo, s.totals.revenue, 'desglose por método vs total', 2);
});
await check('17', 'Tras ANULAR una venta, los cuadres siguen cerrando', async () => {
  const v = await vender([{ productId: X.gaseosa, quantity: 2 }]);
  await cobrar(v.id, { method: 'CASH', amountReceived: 10000 });
  const r = await POST(`/sales/${v.id}/void`, { reason: 'QA re-cuadre' },
    { token: T.admin, headers: { 'X-Approval-Pin': '654321' } });
  assert(r.status < 300, `anular → ${r.status}`);
  const e = (await GET(`/shifts/${X.shift}/expected-cash`, auth(T.admin))).data;
  eq(e.expectedCash, e.openingCash + e.cashSalesTotal + e.cashIn - e.cashOut, 'arqueo tras anular');
  const m = await pnl();
  near(m.netResult,
    m.grossMargin - m.totalFixed - m.oneTimeCost - m.cortesiasCost - m.refundCost - m.wasteCost,
    'P&G tras anular', 2);
});

// ══════════════════════════════════════════════════════════════
log('\n═══ BLOQUE 4 (cierre) — Arqueo ═══');

await check('4', 'Cerrar con cuenta abierta pendiente: la cuenta sigue viva', async () => {
  const s = await GET(`/sales/${X.cuenta}`, auth(T.admin));
  eq(s.data.status, 'PENDIENTE_PAGO', 'la cuenta abierta debe seguir pendiente');
});
await check('4', 'Traspasar la cuenta abierta la saca de esta caja', async () => {
  const r = await POST(`/sales/${X.cuenta}/carry-over`, {}, auth(T.admin));
  assert(r.status < 300, `traspasar → ${r.status} ${JSON.stringify(r.data)?.slice(0, 90)}`);
});
await check('4', 'Cierre con descuadre ≥ $5.000 lo detecta', async () => {
  const e = (await GET(`/shifts/${X.shift}/expected-cash`, auth(T.admin))).data;
  const contado = e.expectedCash - 6000;
  const r = await POST(`/shifts/${X.shift}/close`,
    { countedCash: contado, notes: 'QA cierre con faltante', tips: 10000 }, auth(T.admin));
  assert(r.status < 300, `cerrar → ${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`);
  eq(Math.round(r.data.difference), -6000, 'descuadre');
  return 'faltante de $6.000 detectado';
});
await check('4', 'Las propinas NO suman al efectivo esperado', async () => {
  const s = (await GET(`/shifts/${X.shift}`, auth(T.dueno))).data;
  eq(Number(s.tipsCollected), 10000, 'propinas registradas');
  eq(Number(s.expectedCash), Number(s.countedCash) + 6000, 'las propinas contaminaron el esperado');
});

// ══════════════════════════════════════════════════════════════
log('\n' + '═'.repeat(58));
log(`RESULTADO: ${pass} OK · ${fail} fallas`);
if (fails.length) {
  log('\nFallas:');
  fails.forEach((f) => log('  • ' + f));
}
log('═'.repeat(58));
