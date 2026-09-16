import { writeFileSync } from 'node:fs';
import { expect, request as pwRequest, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';

/**
 * AUDITORÍA EN QA del combo con bebida a elegir — se corre A MANO contra QA
 * (no en CI): `QA=1 vercel env run -- pnpm exec playwright test qa-auditoria`.
 *
 * Cada paso opera la INTERFAZ real de QA y verifica el número contra el API
 * de QA. Un solo login de UI por rol: el API de login admite 10 por minuto
 * por IP y toda la corrida comparte ese cupo (§7.v62).
 */
const API = process.env.QA_API ?? 'https://api-qa-5833.up.railway.app';
const ADMIN = process.env.QA_ADMIN ?? 'https://pos-tercos-admin-git-main-cristianvelezq1551s-projects.vercel.app';
const WEB = process.env.QA_WEB ?? 'https://pos-tercos-web-git-main-cristianvelezq1551s-projects.vercel.app';
const CLAVE = process.env.QA_PASSWORD ?? '';
const OIDC = process.env.VERCEL_OIDC_TOKEN ?? '';
// El token OIDC abre solo previews de SU proyecto: la web (otro proyecto) usa el suyo.
const OIDC_WEB = process.env.QA_WEB_OIDC ?? OIDC;
const SUF = Date.now();

test.skip(!CLAVE || !OIDC, 'Necesita QA_PASSWORD y VERCEL_OIDC_TOKEN (vercel env run)');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let api: APIRequestContext;
let tokDueno: string;
const ids: Record<string, string> = {};
let comboId = '';
let grupoId = '';
const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Client-App': 'admin' });

async function login(email: string): Promise<string> {
  const r = await api.post(`${API}/auth/login`, { headers: { 'X-Client-App': 'admin' }, data: { email, password: CLAVE } });
  expect(r.ok(), `login ${email} → ${r.status()}`).toBeTruthy();
  return ((await r.json()) as { accessToken: string }).accessToken;
}
async function stock(productId: string): Promise<number> {
  const r = await api.get(`${API}/inventory/stock/product/${productId}`, { headers: auth(tokDueno) });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { currentStock: number }).currentStock;
}
async function crear(path: string, data: object): Promise<{ id: string }> {
  const r = await api.post(`${API}${path}`, { headers: auth(tokDueno), data });
  expect(r.ok(), `${path} → ${r.status()} ${await r.text()}`).toBeTruthy();
  return (await r.json()) as { id: string };
}
async function ctxCon(browser: Browser, extra: Record<string, string> = {}): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC, ...extra } });
}

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  tokDueno = await login('dueno@qa.tercos.co');
  // El cajero entra por la PANTALLA (C3): su token de API no hace falta acá.
  const bebida = (name: string, basePrice: number) => ({ name, basePrice, category: 'Bebidas', directResale: true, unitPurchase: 'caja', unitStock: 'unidad', conversionFactor: 24 });
  ids.pepsi = (await crear('/products', bebida(`Pepsi QA ${SUF}`, 5000))).id;
  ids.coca = (await crear('/products', bebida(`Coca QA ${SUF}`, 5000))).id;
  ids.jugo = (await crear('/products', bebida(`Jugo QA ${SUF}`, 8000))).id;
  ids.smash = (await crear('/products', { name: `Smash QA ${SUF}`, basePrice: 22000, category: 'Burgers' })).id;
  for (const b of [ids.pepsi, ids.coca, ids.jugo]) {
    await crear('/inventory/movements', { type: 'INITIAL', entityType: 'PRODUCT', productId: b, delta: 48, unitCost: 1500 });
  }
});
test.afterAll(async () => { await api.dispose(); });

test('C1 · el dueño crea el combo con grupo desde el FORMULARIO', async ({ browser }) => {
  const ctx = await ctxCon(browser); const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`);
  await page.locator('#login-email').fill('dueno@qa.tercos.co');
  await page.locator('#login-password').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 30_000 });
  await page.goto(`${ADMIN}/products/new`);
  await page.getByRole('button', { name: /Combo/ }).first().click();
  await page.getByLabel('Nombre').fill(`Combo QA ${SUF}`);
  await page.getByLabel(/Precio base/i).first().fill('60000');
  await page.getByLabel(/Precio del combo/i).fill('60000');
  // QA tiene la categoría "Combos" (la usan sus productos); el select va por nombre.
  await page.locator('#category').selectOption('Combos');
  await page.locator('select').filter({ hasText: 'Elegir producto' }).first().selectOption(ids.smash);
  await page.locator('input[aria-label="Cantidad"]').first().fill('2');
  await page.getByRole('button', { name: /Agregar grupo para elegir/ }).click();
  await page.getByLabel('Qué elige').fill('Bebida');
  await page.getByLabel('Cuántas').fill('2');
  const opciones = page.getByLabel('Opción', { exact: true });
  await opciones.nth(0).selectOption(ids.pepsi);
  await opciones.nth(1).selectOption(ids.coca);
  await page.getByRole('button', { name: /Agregar opción/ }).click();
  await opciones.nth(2).selectOption(ids.jugo);
  await page.getByLabel('Recargo de la opción').nth(2).fill('3000');
  await page.getByRole('button', { name: /^Crear|Guardar/ }).click();
  await page.waitForURL((u) => u.pathname === '/products', { timeout: 30_000 });
  await ctx.storageState({ path: `/tmp/qa-dueno-${SUF}.json` });
  await ctx.close();

  const r = await api.get(`${API}/products`, { headers: auth(tokDueno) });
  const p = ((await r.json()) as Array<{ id: string; name: string; choiceGroups?: Array<{ id: string; quantity: number; options: unknown[] }> }>).find((x) => x.name === `Combo QA ${SUF}`);
  expect(p, 'el combo no quedó guardado').toBeTruthy();
  expect(p!.choiceGroups).toHaveLength(1);
  expect(p!.choiceGroups![0].quantity).toBe(2);
  expect(p!.choiceGroups![0].options).toHaveLength(3);
  comboId = p!.id; grupoId = p!.choiceGroups![0].id;
  // Los ids quedan en disco para el script de pasos por API que sigue a este spec.
  writeFileSync(process.env.QA_IDS_OUT ?? '/tmp/qa-ids.json', JSON.stringify({ comboId, grupoId, ...ids }));
});

test('C3-C5 · el cajero elige 1 Coca + 1 Jugo, cobra $63.000 y el inventario sigue la elección', async ({ browser }) => {
  const antes = { coca: await stock(ids.coca), jugo: await stock(ids.jugo), pepsi: await stock(ids.pepsi) };
  const ctx = await ctxCon(browser); const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`);
  await page.locator('#login-email').fill('admin@qa.tercos.co');
  await page.locator('#login-password').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => u.pathname === '/inicio', { timeout: 30_000 });
  await page.locator('a[href="/caja"]').click();
  await page.waitForURL((u) => u.pathname === '/caja', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Buscar producto' }).click();
  await page.getByPlaceholder(/buscar/i).first().fill(`Combo QA ${SUF}`);
  await page.getByRole('button', { name: new RegExp(`Combo QA ${SUF}`) }).first().click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText('Bebida 1')).toBeVisible();
  await expect(dlg.getByText('Bebida 2')).toBeVisible();
  const agregar = dlg.getByRole('button', { name: /agregar al carrito/i });
  await expect(agregar).toBeDisabled();
  await dlg.getByRole('radio', { name: new RegExp(`Coca QA ${SUF}`) }).first().check();
  await expect(agregar).toBeDisabled();
  await dlg.getByRole('radio', { name: new RegExp(`Jugo QA ${SUF}`) }).nth(1).check();
  await expect(agregar).toBeEnabled();
  await expect(dlg.getByText('$ 63.000', { exact: false }).first()).toBeVisible();
  await agregar.click();
  await expect(page.getByText(/Bebida:/).first()).toContainText(`Coca QA ${SUF}`);
  await page.getByRole('button', { name: /^Cobrar/ }).click();
  const cobro = page.getByRole('dialog');
  await cobro.getByRole('button', { name: 'Efectivo', exact: true }).click();
  await cobro.getByLabel('Recibido').fill('100000');
  await cobro.getByRole('button', { name: /Confirmar/ }).click();
  await expect(page.getByText(/Recibo #\d+/).first()).toBeVisible({ timeout: 30_000 });
  await ctx.storageState({ path: `/tmp/qa-admin-${SUF}.json` });
  await ctx.close();
  expect(await stock(ids.coca)).toBe(antes.coca - 1);
  expect(await stock(ids.jugo)).toBe(antes.jugo - 1);
  expect(await stock(ids.pepsi)).toBe(antes.pepsi);
});

test('C8-UI · el cajero EDITA el pedido cobrado del combo desde el historial (el PATCH lleva la elección)', async ({ browser }) => {
  // Hueco encontrado en QA el 2026-09-16: el modal no mandaba la elección y el
  // servidor rechazaba con 400 cualquier edición de un pedido con combo con
  // grupos. Subir la cantidad a 2 conserva la línea cobrada (misma bebida ⇒
  // misma identidad ⇒ precio congelado 63.000) y descuenta una Coca y un Jugo más.
  const antes = { coca: await stock(ids.coca), jugo: await stock(ids.jugo) };
  const ctx = await browser.newContext({
    storageState: `/tmp/qa-admin-${SUF}.json`,
    extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC },
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  // La fila plegada del historial muestra "#recibo · hora · medio · total", no
  // el nombre del producto: se busca por el número de recibo de la venta que
  // C3 acaba de cobrar (la más nueva de este combo).
  const rv = await api.get(`${API}/sales?limit=30`, { headers: auth(tokDueno) });
  const vendida = ((await rv.json()) as Array<{ receiptNumber: number; status: string; items: Array<{ productId: string }> }>)
    .filter((v) => v.status === 'PAGADO' && v.items.some((it) => it.productId === comboId))
    .sort((a, b) => b.receiptNumber - a.receiptNumber)[0];
  expect(vendida, 'no se encontró la venta cobrada en C3').toBeTruthy();
  await page.goto(`${ADMIN}/caja/historial`);
  // El DOM no deja espacio entre "#58" y "Mostrador", así que `\b` no matchea:
  // se ancla al nombre accesible del botón de la fila (ese sí va normalizado).
  const fila = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: new RegExp(`^#${vendida!.receiptNumber} `) }) })
    .first();
  await expect(fila).toBeVisible({ timeout: 30_000 });
  await fila.getByRole('button', { name: 'Editar' }).first().click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  // La línea del combo dice qué bebidas lleva.
  await expect(modal.getByText(/Bebida:/).first()).toContainText(`Coca QA ${SUF}`);
  await modal.getByRole('button', { name: new RegExp(`Agregar uno de Combo QA ${SUF}`) }).click();
  await expect(modal.getByText('Nuevo total estimado').locator('..').getByText(/126\.000/)).toBeVisible();
  await modal.getByRole('button', { name: /Guardar cambios/ }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  await ctx.close();

  expect(await stock(ids.coca)).toBe(antes.coca - 1);
  expect(await stock(ids.jugo)).toBe(antes.jugo - 1);
  const r = await api.get(`${API}/sales?limit=20`, { headers: auth(tokDueno) });
  const ventas = (await r.json()) as Array<{ items: Array<{ productId: string; quantity: number; unitPrice: number; choices?: unknown[] }>; total: number; status: string }>;
  const editada = ventas.find((v) => v.status === 'PAGADO' && v.items.some((it) => it.productId === comboId && it.quantity === 2));
  expect(editada, 'no aparece la venta editada con 2 combos').toBeTruthy();
  expect(editada!.items[0].unitPrice).toBe(63000);
  expect(editada!.total).toBe(126000);
  expect(editada!.items[0].choices).toHaveLength(2);
});

test('C11 · en la web (teléfono) el combo pide elegir y muestra el recargo', async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC_WEB } }); const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 720 });
  const card = page.getByRole('button', { name: new RegExp(`Combo QA ${SUF}`) }).first();
  await expect(async () => { await page.goto(WEB); await expect(card).toBeVisible({ timeout: 3_000 }); }).toPass({ timeout: 60_000 });
  await card.click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText('Bebida 1')).toBeVisible();
  const agregar = page.getByRole('button', { name: /Agregar al carrito/ });
  await expect(agregar).toBeDisabled();
  await dlg.getByRole('radio', { name: new RegExp(`Coca QA ${SUF}`) }).first().check();
  await dlg.getByRole('radio', { name: new RegExp(`Jugo QA ${SUF}`) }).nth(1).check();
  await expect(agregar).toBeEnabled();
  await expect(dlg.getByText('+$ 3.000').first()).toBeVisible();
  await ctx.close();
});
