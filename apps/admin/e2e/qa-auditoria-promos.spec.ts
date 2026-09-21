import { expect, request as pwRequest, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { sameBusinessDay } from '@pos-tercos/domain';

/**
 * AUDITORÍA EN QA de las promociones por VARIANTE y a PRECIO FIJO — se corre A
 * MANO contra QA (no en CI):
 *   cd apps/admin && QA_PASSWORD=… QA_WEB_OIDC=… vercel env run -- pnpm exec playwright test qa-auditoria-promos
 *
 * Cada paso opera la INTERFAZ real de QA (el dueño crea las promos desde el
 * formulario, el cajero cobra, el cliente pide desde la web a 390 px) y
 * verifica el número contra el API de QA, que recalcula con su propio motor.
 * Un solo login de UI por rol: el API de login admite 10 por minuto por IP y
 * toda la corrida comparte ese cupo (§7.v62).
 */
const API = process.env.QA_API ?? 'https://api-qa-5833.up.railway.app';
const ADMIN = process.env.QA_ADMIN ?? 'https://pos-tercos-admin-git-main-cristianvelezq1551s-projects.vercel.app';
const WEB = process.env.QA_WEB ?? 'https://pos-tercos-web-git-main-cristianvelezq1551s-projects.vercel.app';
const CLAVE = process.env.QA_PASSWORD ?? '';
const OIDC = process.env.VERCEL_OIDC_TOKEN ?? '';
// El token OIDC abre solo previews de SU proyecto: la web (otro proyecto) usa el suyo.
const OIDC_WEB = process.env.QA_WEB_OIDC ?? OIDC;
const SUF = Date.now();
const SANDWICH = `Sandwich QA ${SUF}`;
const PAPAS = `Papas QA ${SUF}`;
const POLLO = `Pollo QA ${SUF}`;
const CARNE = `Carne QA ${SUF}`;
const MALTEADA = `Malteada QA ${SUF}`;
const MINI = `Mini QA ${SUF}`;
const QUESO = `Queso extra QA ${SUF}`;
const PROMO_FIJA = `Sandwich a 22 QA ${SUF}`;
const PROMO_POLLO = `20% Papas Pollo QA ${SUF}`;
const PROMO_CLASICA = `10% Malteada QA ${SUF}`;
const CLIENTE = `Cliente Promo ${SUF}`;

test.skip(!CLAVE || !OIDC, 'Necesita QA_PASSWORD y VERCEL_OIDC_TOKEN (vercel env run)');
test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

let api: APIRequestContext;
let tokDueno: string;
let tokAdmin: string;
let reciboCaja = 0;
const ids: Record<string, string> = {};
const promoIds: Record<string, string> = {};
const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Client-App': 'admin' });
const DUENO_STATE = `/tmp/qa-promos-dueno-${SUF}.json`;
const ADMIN_STATE = `/tmp/qa-promos-admin-${SUF}.json`;

type Venta = {
  id: string;
  receiptNumber: number;
  status: string;
  type: string;
  customerName: string | null;
  total: number;
  discountTotal: number;
  items: Array<{ productId: string; sizeId: string | null; appliedPromotionId: string | null; lineDiscount: number; lineTotal: number }>;
};
type Promo = { id: string; name: string; type: string; fixedPrice: number | null; isActive: boolean; sizeIdsByProduct?: Record<string, string[]> };

async function login(email: string): Promise<string> {
  const r = await api.post(`${API}/auth/login`, { headers: { 'X-Client-App': 'admin' }, data: { email, password: CLAVE } });
  expect(r.ok(), `login ${email} → ${r.status()}`).toBeTruthy();
  return ((await r.json()) as { accessToken: string }).accessToken;
}
async function crear<T = { id: string }>(path: string, data: object): Promise<T> {
  const r = await api.post(`${API}${path}`, { headers: auth(tokDueno), data });
  expect(r.ok(), `${path} → ${r.status()} ${await r.text()}`).toBeTruthy();
  return (await r.json()) as T;
}
async function promos(): Promise<Promo[]> {
  const r = await api.get(`${API}/promotions`, { headers: auth(tokDueno) });
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as Promo[];
}
async function ventas(limit = 10): Promise<Venta[]> {
  const r = await api.get(`${API}/sales?limit=${limit}`, { headers: auth(tokDueno) });
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as Venta[];
}
async function ctxCon(browser: Browser, extra: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ ...extra, extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC, ...(extra.extraHTTPHeaders ?? {}) } });
}
async function loginUi(page: Page, email: string) {
  await page.goto(`${ADMIN}/login`);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 30_000 });
}

/**
 * La caja de QA es ÚNICA y una por día de negocio, y solo el operativo que la
 * abrió puede operarla. Si quedó una de otro día (stale), el dueño la cierra
 * arqueando exactamente lo esperado (cajón y cuenta: §7.v20 exige contar los
 * medios digitales) y admin@qa abre la de hoy.
 */
async function cajaAbiertaHoy(): Promise<void> {
  const cur = await api.get(`${API}/shifts/current`, { headers: auth(tokAdmin) });
  expect(cur.ok()).toBeTruthy();
  const txt = await cur.text();
  let abierta = txt ? (JSON.parse(txt) as { id: string; openedAt: string }) : null;
  if (abierta && !sameBusinessDay(new Date(abierta.openedAt), new Date())) {
    const e = await api.get(`${API}/shifts/${abierta.id}/expected-cash`, { headers: auth(tokDueno) });
    expect(e.ok(), `expected-cash → ${e.status()}`).toBeTruthy();
    const esperado = (await e.json()) as { expectedCash: number; digital: Array<{ method: string; expected: number }> };
    const c = await api.post(`${API}/shifts/${abierta.id}/close`, {
      headers: auth(tokDueno),
      data: {
        countedCash: esperado.expectedCash,
        digitalCounts: esperado.digital.map((d) => ({ method: d.method, counted: d.expected })),
        notes: 'Cierre de caja de otro día (auditoría promos QA)',
      },
    });
    expect(c.ok(), `cierre stale → ${c.status()} ${await c.text()}`).toBeTruthy();
    abierta = null;
  }
  if (abierta) return;
  const o = await api.post(`${API}/shifts/open`, { headers: auth(tokAdmin), data: { openingCash: 100000, notes: `Auditoría promos QA ${SUF}` } });
  if (o.ok()) return;
  expect(o.status(), `open → ${o.status()} ${await o.text()}`).toBe(409);
  const l = await api.get(`${API}/shifts?limit=10`, { headers: auth(tokDueno) });
  const cerradaHoy = ((await l.json()) as Array<{ id: string; status: string; openedAt: string }>).find(
    (s) => s.status === 'CLOSED' && sameBusinessDay(new Date(s.openedAt), new Date()),
  );
  expect(cerradaHoy, 'no hay caja CLOSED de hoy para reabrir').toBeTruthy();
  const r = await api.post(`${API}/shifts/${cerradaHoy!.id}/reopen`, { headers: auth(tokDueno) });
  expect(r.ok(), `reopen → ${r.status()}`).toBeTruthy();
}

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  tokDueno = await login('dueno@qa.tercos.co');
  tokAdmin = await login('admin@qa.tercos.co');
  await cajaAbiertaHoy();

  const reventa = { directResale: true, unitPurchase: 'caja', unitStock: 'unidad', conversionFactor: 12 };
  ids.sandwich = (
    await crear('/products', {
      ...reventa,
      name: SANDWICH,
      basePrice: 27000,
      category: 'Comidas',
      modifiersEnabled: true,
      modifiers: [{ name: QUESO, priceDelta: 3000 }],
    })
  ).id;
  // Más barato que el precio fijo: la promo NO debe subirle el precio.
  ids.mini = (await crear('/products', { ...reventa, name: MINI, basePrice: 15000, category: 'Comidas' })).id;
  const papas = await crear<{ id: string; sizes: Array<{ id: string; name: string }> }>('/products', {
    ...reventa,
    name: PAPAS,
    basePrice: 25000,
    category: 'Comidas',
    sizes: [
      { name: POLLO, priceModifier: 0, sortOrder: 0 },
      { name: CARNE, priceModifier: 3000, sortOrder: 1 },
    ],
  });
  ids.papas = papas.id;
  ids.pollo = papas.sizes.find((s) => s.name === POLLO)!.id;
  ids.carne = papas.sizes.find((s) => s.name === CARNE)!.id;
  ids.malteada = (await crear('/products', { ...reventa, name: MALTEADA, basePrice: 10000, category: 'Bebidas' })).id;
  for (const pid of [ids.sandwich, ids.papas, ids.malteada, ids.mini]) {
    await crear('/inventory/movements', { type: 'INITIAL', entityType: 'PRODUCT', productId: pid, delta: 48, unitCost: 5000 });
  }
  // Regresión: una promo CLÁSICA (porcentaje, todas las variantes) creada como
  // siempre. Tiene que seguir anunciándose en la tarjeta y descontando igual.
  const clasica = await crear<Promo>('/promotions', {
    name: PROMO_CLASICA,
    type: 'PERCENT_OFF',
    discountPct: 0.1,
    daysOfWeekMask: 127,
    timeStart: '00:00:00',
    timeEnd: '23:59:59',
    channel: 'BOTH',
    productIds: [ids.malteada],
  });
  promoIds.clasica = clasica.id;
  // Si el API de QA aún corriera el código viejo, `fixedPrice` no existiría en
  // el DTO y la corrida pararía acá en vez de crear promos que nadie entiende.
  expect(clasica, 'el API de QA no expone fixedPrice: ¿código viejo?').toHaveProperty('fixedPrice');
});

test.afterAll(async () => {
  // QA queda sin las promos de la auditoría: la primera promo de precio fijo
  // real la crea el dueño en prod cuando lo decida.
  for (const id of Object.values(promoIds)) {
    await api.delete(`${API}/promotions/${id}`, { headers: auth(tokDueno) }).catch(() => undefined);
  }
  await api.dispose();
});

test('P1 · el dueño crea desde el FORMULARIO la promo de precio fijo y la limitada a la variante Pollo', async ({ browser }) => {
  const ctx = await ctxCon(browser, { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await loginUi(page, 'dueno@qa.tercos.co');

  // (a) Precio fijo para el Sandwich.
  await page.goto(`${ADMIN}/promotions/new`);
  await page.getByPlaceholder(/Hamburguesa Nashville/).fill(PROMO_FIJA);
  await page.getByText('Precio fijo', { exact: true }).click();
  await page.getByPlaceholder('22.000').fill('22000');
  await page.getByRole('checkbox', { name: SANDWICH }).check();
  await page.getByRole('checkbox', { name: MINI }).check();
  await page.getByRole('button', { name: 'Crear promoción' }).click();
  // Antes del arreglo el formulario moría acá en "Creando…" (navegación
  // cliente colgada) con la promo ya creada.
  await page.waitForURL((u) => u.pathname === '/promotions', { timeout: 30_000 });
  await expect(page.getByText(PROMO_FIJA)).toBeVisible();
  await expect(page.getByText('Precio fijo').first()).toBeVisible();

  // (b) 20% en Papas, SOLO la variante Pollo.
  await page.goto(`${ADMIN}/promotions/new`);
  await page.getByPlaceholder(/Hamburguesa Nashville/).fill(PROMO_POLLO);
  await page.getByPlaceholder('20', { exact: true }).fill('20');
  await page.getByRole('checkbox', { name: PAPAS }).check();
  const variantes = page.getByRole('group', { name: `Variantes de ${PAPAS}` });
  await expect(variantes.getByRole('button', { name: 'Todas las variantes' })).toHaveAttribute('aria-pressed', 'true');
  await variantes.getByRole('button', { name: POLLO }).click();
  await expect(variantes.getByRole('button', { name: 'Todas las variantes' })).toHaveAttribute('aria-pressed', 'false');
  await expect(variantes.getByRole('button', { name: POLLO })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Crear promoción' }).click();
  await page.waitForURL((u) => u.pathname === '/promotions', { timeout: 30_000 });
  await expect(page.getByText(PROMO_POLLO)).toBeVisible();

  const lista = await promos();
  const fija = lista.find((p) => p.name === PROMO_FIJA);
  const pollo = lista.find((p) => p.name === PROMO_POLLO);
  expect(fija, 'la promo de precio fijo no quedó guardada').toBeTruthy();
  expect(pollo, 'la promo por variante no quedó guardada').toBeTruthy();
  expect(fija!.type).toBe('FIXED_PRICE');
  expect(fija!.fixedPrice).toBe(22000);
  expect(fija!.sizeIdsByProduct).toBeUndefined();
  expect(pollo!.type).toBe('PERCENT_OFF');
  expect(pollo!.sizeIdsByProduct).toEqual({ [ids.papas]: [ids.pollo] });
  promoIds.fija = fija!.id;
  promoIds.pollo = pollo!.id;

  // El detalle lo dice en palabras.
  await page.goto(`${ADMIN}/promotions/${fija!.id}`);
  await expect(page.getByText(/Se vende a \$\s?22\.000/)).toBeVisible();
  await page.goto(`${ADMIN}/promotions/${pollo!.id}`);
  await expect(page.getByText(`· solo ${POLLO}`)).toBeVisible();
  await ctx.storageState({ path: DUENO_STATE });
  await ctx.close();
});

test('P2 · en la CAJA: Papas·Carne paga lleno, Papas·Pollo descuenta, el Sandwich dice "Hoy $22.000", la clásica sigue igual; el cobro real da $54.000', async ({ browser }) => {
  const ctx = await ctxCon(browser, { viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await loginUi(page, 'admin@qa.tercos.co');
  await page.locator('a[href="/caja"]').click();
  await page.waitForURL((u) => u.pathname === '/caja', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Buscar producto' }).click();
  await page.getByPlaceholder(/buscar/i).first().fill(`QA ${SUF}`);

  const tarjetaPapas = page.getByRole('button', { name: new RegExp(PAPAS) }).first();
  const tarjetaSandwich = page.getByRole('button', { name: new RegExp(SANDWICH) }).first();
  const tarjetaMalteada = page.getByRole('button', { name: new RegExp(MALTEADA) }).first();
  await expect(tarjetaSandwich).toContainText('Hoy $22.000');
  await expect(tarjetaPapas).toBeVisible();
  await expect(tarjetaPapas).not.toContainText('−20%');
  await expect(tarjetaMalteada).toContainText('−10%');
  // Más barato que el precio fijo: ni la tarjeta ni el selector prometen nada.
  const tarjetaMini = page.getByRole('button', { name: new RegExp(MINI) }).first();
  await expect(tarjetaMini).toBeVisible();
  await expect(tarjetaMini).not.toContainText('Hoy');

  const dialogo = page.getByRole('dialog');
  await tarjetaMini.click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText(/Promo aplicada/)).toHaveCount(0);
  await expect(dialogo.getByText('$ 15.000', { exact: false }).first()).toBeVisible();
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toBeHidden();
  await tarjetaPapas.click();
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('radio', { name: new RegExp(CARNE) }).check();
  await expect(dialogo.getByText(/Promo aplicada/)).toHaveCount(0);
  await expect(dialogo.getByText('$ 28.000', { exact: false }).first()).toBeVisible();
  await dialogo.getByRole('radio', { name: new RegExp(POLLO) }).check();
  await expect(dialogo.getByText(/Promo aplicada/)).toBeVisible();
  await expect(dialogo.getByText('$ 20.000', { exact: false }).first()).toBeVisible();
  await dialogo.getByRole('button', { name: /agregar al carrito/i }).click();
  await expect(dialogo).toBeHidden();

  await tarjetaSandwich.click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText(/Promo aplicada/)).toBeVisible();
  await expect(dialogo.getByText('$ 22.000', { exact: false }).first()).toBeVisible();
  // El extra se suma ENCIMA del precio fijo (decisión del dueño): 22.000 + 3.000.
  await dialogo.getByRole('checkbox', { name: new RegExp(QUESO) }).check();
  await expect(dialogo.getByText(/Promo aplicada/)).toBeVisible();
  await expect(dialogo.getByText('$ 25.000', { exact: false }).first()).toBeVisible();
  await dialogo.getByRole('button', { name: /agregar al carrito/i }).click();
  await expect(dialogo).toBeHidden();

  await tarjetaMalteada.click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText(/Promo aplicada/)).toBeVisible();
  await expect(dialogo.getByText('$ 9.000', { exact: false }).first()).toBeVisible();
  await dialogo.getByRole('button', { name: /agregar al carrito/i }).click();
  await expect(dialogo).toBeHidden();

  await page.getByRole('button', { name: /^Cobrar/ }).click();
  const cobro = page.getByRole('dialog');
  await expect(cobro).toBeVisible();
  await cobro.getByRole('button', { name: 'Efectivo', exact: true }).click();
  await cobro.getByLabel('Recibido').fill('100000');
  await cobro.getByRole('button', { name: /Confirmar/ }).click();
  await expect(page.getByText(/Recibo #\d+/).first()).toBeVisible({ timeout: 30_000 });
  await ctx.storageState({ path: ADMIN_STATE });
  await ctx.close();

  // El servidor recalcula con su propio motor: Papas Pollo 20.000 + Sandwich
  // con queso 25.000 + Malteada 9.000 = 54.000, descuentos 5.000 + 5.000 + 1.000.
  const venta = (await ventas(5)).find((v) => v.status === 'PAGADO' && v.items.some((it) => it.productId === ids.sandwich));
  expect(venta, 'no aparece la venta cobrada').toBeTruthy();
  reciboCaja = venta!.receiptNumber;
  expect(venta!.total).toBe(54000);
  expect(venta!.discountTotal).toBe(11000);
  const papasLinea = venta!.items.find((it) => it.productId === ids.papas)!;
  expect(papasLinea.sizeId).toBe(ids.pollo);
  expect(papasLinea.appliedPromotionId).toBe(promoIds.pollo);
  expect(papasLinea.lineDiscount).toBe(5000);
  const sandwichLinea = venta!.items.find((it) => it.productId === ids.sandwich)!;
  expect(sandwichLinea.appliedPromotionId).toBe(promoIds.fija);
  expect(sandwichLinea.lineTotal).toBe(25000);
  expect(sandwichLinea.lineDiscount).toBe(5000);
  const malteadaLinea = venta!.items.find((it) => it.productId === ids.malteada)!;
  expect(malteadaLinea.appliedPromotionId).toBe(promoIds.clasica);
  expect(malteadaLinea.lineDiscount).toBe(1000);
});

test('P3 · en la WEB (teléfono): la tarjeta de Papas no promete nada, el selector descuenta solo Pollo, el Sandwich dice "Hoy $22.000"; el pedido real da $45.000', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 720 },
    extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC_WEB },
  });
  const page = await ctx.newPage();
  const card = page.getByRole('button', { name: new RegExp(PAPAS) }).first();
  // El menú público se cachea 30 s: se recarga hasta ver el producto.
  await expect(async () => {
    await page.goto(WEB);
    await expect(card).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });

  await expect(card).not.toContainText('−20%');
  await expect(page.getByRole('button', { name: new RegExp(SANDWICH) }).first()).toContainText('Hoy $22.000');
  await expect(page.getByRole('button', { name: new RegExp(MALTEADA) }).first()).toContainText('−10%');
  await expect(page.getByRole('button', { name: new RegExp(MINI) }).first()).not.toContainText('Hoy');

  const dialogo = page.getByRole('dialog');
  await card.click();
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('radio', { name: new RegExp(CARNE) }).check();
  await expect(dialogo.getByText('$ 20.000')).toHaveCount(0);
  await dialogo.getByRole('radio', { name: new RegExp(POLLO) }).check();
  await expect(dialogo.getByText('$ 20.000').first()).toBeVisible();
  await expect(dialogo.getByText('−20%').first()).toBeVisible();
  await dialogo.getByRole('button', { name: /Agregar al carrito/ }).click();
  await expect(dialogo).toBeHidden();

  await page.getByRole('button', { name: new RegExp(SANDWICH) }).first().click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText('Hoy $22.000').first()).toBeVisible();
  await expect(dialogo.getByText('$ 22.000').first()).toBeVisible();
  await dialogo.getByRole('checkbox', { name: new RegExp(QUESO) }).check();
  await expect(dialogo.getByText('$ 25.000').first()).toBeVisible();
  await dialogo.getByRole('button', { name: /Agregar al carrito/ }).click();
  await expect(dialogo).toBeHidden();

  // Pedido de verdad, si el local está recibiendo pedidos web en QA. En
  // teléfono el carrito se abre desde la barra inferior ("2 Carrito"); en
  // escritorio, desde el botón de la barra superior ("2 ítems").
  await page.getByRole('button', { name: /Carrito|ítems?$/ }).first().click();
  const pagar = page.getByRole('button', { name: 'Ir a pagar' });
  const cerrado = await page.getByRole('button', { name: 'Cerrado por ahora' }).isVisible().catch(() => false);
  if (cerrado) {
    test.info().annotations.push({ type: 'aviso', description: 'La web de QA está cerrada por horario: el pedido real no se probó desde la pantalla (lo cubre el e2e del API).' });
    await ctx.close();
    return;
  }
  await expect(page.getByText('$ 45.000').first()).toBeVisible();
  await pagar.click();
  await page.waitForURL((u) => u.pathname === '/checkout', { timeout: 30_000 });
  await page.getByPlaceholder('Como te van a llamar al retirar').fill(CLIENTE);
  await page.getByPlaceholder('3001234567').fill('3009998877');
  await page.getByRole('button', { name: /Confirmar y abrir WhatsApp/ }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/checkout/success/'), { timeout: 45_000 });
  await ctx.close();

  const pedido = (await ventas(10)).find((v) => v.type === 'WEB_PICKUP' && v.customerName === CLIENTE);
  expect(pedido, 'el pedido web no quedó creado').toBeTruthy();
  expect(pedido!.total).toBe(45000);
  expect(pedido!.discountTotal).toBe(10000);
  expect(pedido!.items.find((it) => it.productId === ids.papas)!.appliedPromotionId).toBe(promoIds.pollo);
  expect(pedido!.items.find((it) => it.productId === ids.sandwich)!.appliedPromotionId).toBe(promoIds.fija);
  // Se cancela para no dejar un pedido pendiente en la caja de QA.
  const c = await api.post(`${API}/sales/${pedido!.id}/cancel`, { headers: auth(tokAdmin), data: { reason: 'Auditoría promos QA' } });
  expect(c.ok(), `cancel → ${c.status()} ${await c.text()}`).toBeTruthy();
});

test('P3b · el cajero EDITA desde el historial la venta cobrada con promos: sube el Sandwich a 2 y el servidor recalcula $79.000', async ({ browser }) => {
  // El modal de edición arma las líneas con tamaño y extras (cambio de esta
  // tanda): el estimado tiene que coincidir con lo que cobra el servidor.
  expect(reciboCaja, 'P2 no dejó el recibo').toBeGreaterThan(0);
  const ctx = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC }, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/caja/historial`);
  const fila = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: new RegExp(`^#${reciboCaja} `) }) }).first();
  await expect(fila).toBeVisible({ timeout: 30_000 });
  await fila.getByRole('button', { name: 'Editar' }).first().click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: new RegExp(`Agregar uno de ${SANDWICH}`) }).click();
  // 20.000 + 2 × 25.000 + 9.000 = 79.000 (el precio fijo por unidad, extra encima).
  await expect(modal.getByText('Nuevo total estimado').locator('..').getByText(/79\.000/)).toBeVisible();
  await modal.getByRole('button', { name: /Guardar cambios/ }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  await ctx.close();
  const editada = (await ventas(10)).find((v) => v.receiptNumber === reciboCaja);
  expect(editada, 'no aparece la venta editada').toBeTruthy();
  expect(editada!.total).toBe(79000);
  expect(editada!.discountTotal).toBe(16000);
  const sw = editada!.items.find((it) => it.productId === ids.sandwich)!;
  expect(sw.lineTotal).toBe(50000);
  expect(sw.appliedPromotionId).toBe(promoIds.fija);
});

test('P4 · el dueño EDITA la promo por variante (vuelve a "todas") y el detalle lo refleja; apagar y encender funcionan', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: DUENO_STATE, extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC }, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/promotions/${promoIds.pollo}/edit`);
  const variantes = page.getByRole('group', { name: `Variantes de ${PAPAS}` });
  await expect(variantes.getByRole('button', { name: POLLO })).toHaveAttribute('aria-pressed', 'true');
  await variantes.getByRole('button', { name: 'Todas las variantes' }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.waitForURL((u) => u.pathname === `/promotions/${promoIds.pollo}`, { timeout: 30_000 });
  await expect(page.getByText(`· solo ${POLLO}`)).toHaveCount(0);
  const editada = (await promos()).find((p) => p.id === promoIds.pollo)!;
  expect(editada.sizeIdsByProduct).toBeUndefined();

  // Apagar (navegación completa) y encender otra vez.
  await page.getByRole('button', { name: 'Apagar promoción' }).click();
  await page.getByRole('button', { name: 'Sí, apagar' }).click();
  await page.waitForURL((u) => u.pathname === '/promotions', { timeout: 30_000 });
  expect((await promos()).find((p) => p.id === promoIds.pollo)!.isActive).toBe(false);
  await page.goto(`${ADMIN}/promotions/${promoIds.pollo}`);
  await page.getByRole('button', { name: 'Encender promoción' }).click();
  await expect(page.getByRole('button', { name: 'Apagar promoción' })).toBeVisible({ timeout: 30_000 });
  expect((await promos()).find((p) => p.id === promoIds.pollo)!.isActive).toBe(true);
  await ctx.close();
});

test('P5 · barrido: 13 pantallas abren sin error, en escritorio y en teléfono', async ({ browser }) => {
  const rutas = [
    '/inicio',
    '/promotions',
    '/promotions/new',
    `/promotions/${promoIds.fija}`,
    `/promotions/${promoIds.fija}/edit`,
    `/promotions/${promoIds.pollo}`,
    `/products/${ids.papas}`,
    '/reports/sales',
    '/reports/products',
    '/finanzas/estado',
    '/products',
    '/shifts',
    '/inventory',
  ];
  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ storageState: DUENO_STATE, extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC }, viewport });
    const page = await ctx.newPage();
    const errores: string[] = [];
    page.on('console', (m) => {
      // El widget de feedback de Vercel choca con la CSP en los previews: no existe en prod.
      if (m.type() === 'error' && !/vercel\.live|Content Security Policy/.test(m.text())) errores.push(m.text());
    });
    page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
    for (const ruta of rutas) {
      const r = await page.goto(`${ADMIN}${ruta}`, { waitUntil: 'networkidle', timeout: 45_000 });
      expect(r?.status(), `${ruta} @${viewport.width}`).toBeLessThan(400);
      await expect(page.getByText(/Application error|Algo salió mal|Unhandled Runtime Error/), `${ruta} @${viewport.width}`).toHaveCount(0);
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(ancho, `${ruta} @${viewport.width} desborda`).toBeLessThanOrEqual(viewport.width);
    }
    expect(errores, `errores de consola @${viewport.width}`).toEqual([]);
    await ctx.close();
  }
  // La caja del cajero también, con su sesión.
  const ctx = await browser.newContext({ storageState: ADMIN_STATE, extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC }, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  for (const ruta of ['/caja', '/caja/historial']) {
    const r = await page.goto(`${ADMIN}${ruta}`, { waitUntil: 'networkidle', timeout: 45_000 });
    expect(r?.status(), ruta).toBeLessThan(400);
    await expect(page.getByText(/Application error|Algo salió mal/)).toHaveCount(0);
  }
  await ctx.close();
});
