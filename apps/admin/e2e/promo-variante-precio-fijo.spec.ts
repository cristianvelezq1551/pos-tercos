import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import {
  API,
  DUENO_EMAIL,
  ensureOpenShiftToday,
  login,
  loginAndEnterCaja,
  OPERATIVO_EMAIL,
  PASSWORD,
  WEB_URL,
  type Session,
} from './helpers';

/**
 * Promociones por VARIANTE y a PRECIO FIJO, vistas desde las pantallas.
 *
 * La API ya prueba los números; lo que solo se ve abriendo la app es que la
 * tarjeta NO prometa un descuento que la otra variante no tiene, que el
 * selector lo muestre al elegir el tamaño, que el precio fijo se lea como
 * "Hoy $22.000" y que el formulario deje limitar la promo a una variante.
 */

const SUF = Date.now();
const SANDWICH = `Sandwich Nav ${SUF}`;
const PAPAS = `Papas Nav ${SUF}`;
const POLLO = `Pollo Nav ${SUF}`;
const CARNE = `Carne Nav ${SUF}`;

async function crear<T = { id: string }>(
  api: APIRequestContext,
  s: Session,
  path: string,
  data: object,
): Promise<T> {
  const res = await api.post(`${API}${path}`, {
    headers: { Authorization: `Bearer ${s.token}`, 'X-Client-App': 'admin' },
    data,
  });
  expect(res.ok(), `${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

let api: APIRequestContext;
let dueno: Session;
let sandwichId: string;
let papasId: string;
let polloId: string;
let carneId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  dueno = await login(api, DUENO_EMAIL);
  const operativo = await login(api, OPERATIVO_EMAIL);
  await ensureOpenShiftToday(api, operativo, dueno);

  const reventa = { directResale: true, unitPurchase: 'caja', unitStock: 'unidad', conversionFactor: 12 };
  sandwichId = (
    await crear(api, dueno, '/products', { ...reventa, name: SANDWICH, basePrice: 27000, category: 'Burgers' })
  ).id;
  const papas = await crear<{ id: string; sizes: Array<{ id: string; name: string }> }>(api, dueno, '/products', {
    ...reventa,
    name: PAPAS,
    basePrice: 25000,
    category: 'Burgers',
    sizes: [
      { name: POLLO, priceModifier: 0, sortOrder: 0 },
      { name: CARNE, priceModifier: 3000, sortOrder: 1 },
    ],
  });
  papasId = papas.id;
  polloId = papas.sizes.find((s) => s.name === POLLO)!.id;
  carneId = papas.sizes.find((s) => s.name === CARNE)!.id;
  for (const pid of [sandwichId, papasId]) {
    await crear(api, dueno, '/inventory/movements', {
      type: 'INITIAL',
      entityType: 'PRODUCT',
      productId: pid,
      delta: 48,
      unitCost: 5000,
    });
  }
  const cuando = { daysOfWeekMask: 127, timeStart: '00:00:00', timeEnd: '23:59:59', channel: 'BOTH' };
  // 20% SOLO en las Papas de Pollo: la de Carne paga lleno.
  await crear(api, dueno, '/promotions', {
    ...cuando,
    name: `20% Papas Pollo ${SUF}`,
    type: 'PERCENT_OFF',
    discountPct: 0.2,
    productIds: [papasId],
    sizeIdsByProduct: { [papasId]: [polloId] },
  });
  // El Sandwich a precio fijo.
  await crear(api, dueno, '/promotions', {
    ...cuando,
    name: `Sandwich a 22 ${SUF}`,
    type: 'FIXED_PRICE',
    fixedPrice: 22000,
    productIds: [sandwichId],
  });
});

test.afterAll(async () => {
  await api.dispose();
});

test('en la caja, la variante limitada descuenta y la otra paga lleno; el precio fijo se lee "Hoy $22.000"', async ({
  page,
  request,
}) => {
  await loginAndEnterCaja(page, OPERATIVO_EMAIL);
  await page.getByRole('button', { name: 'Buscar producto' }).click();
  await page.getByPlaceholder(/buscar/i).first().fill(`Nav ${SUF}`);

  // La tarjeta del Sandwich ya anuncia el precio fijo; la de Papas NO anuncia
  // nada: su promo depende del tamaño.
  await expect(page.getByText('Hoy $22.000').first()).toBeVisible();
  const tarjetaPapas = page.getByRole('button', { name: new RegExp(PAPAS) }).first();
  await expect(tarjetaPapas).not.toContainText('−20%');

  await tarjetaPapas.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('radio', { name: new RegExp(CARNE) }).check();
  await expect(dialogo.getByText(/Promo aplicada/)).toHaveCount(0);
  await expect(dialogo.getByText('$ 28.000', { exact: false }).first()).toBeVisible();
  await dialogo.getByRole('radio', { name: new RegExp(POLLO) }).check();
  await expect(dialogo.getByText(/Promo aplicada/)).toBeVisible();
  await expect(dialogo.getByText('$ 20.000', { exact: false }).first()).toBeVisible();
  await dialogo.getByRole('button', { name: /agregar al carrito/i }).click();
  await expect(dialogo).toBeHidden();

  await page.getByRole('button', { name: new RegExp(SANDWICH) }).first().click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText(/Promo aplicada/)).toBeVisible();
  await expect(dialogo.getByText('$ 22.000', { exact: false }).first()).toBeVisible();
  await dialogo.getByRole('button', { name: /agregar al carrito/i }).click();
  await expect(dialogo).toBeHidden();

  // Cobrar de verdad: el servidor recalcula con su propio motor.
  await page.getByRole('button', { name: /^Cobrar/ }).click();
  const cobro = page.getByRole('dialog');
  await expect(cobro).toBeVisible();
  await cobro.getByRole('button', { name: 'Efectivo', exact: true }).click();
  await cobro.getByLabel('Recibido').fill('100000');
  await cobro.getByRole('button', { name: /Confirmar/ }).click();
  await expect(page.getByText(/Recibo #\d+/).first()).toBeVisible({ timeout: 20_000 });

  const res = await request.get(`${API}/sales?limit=1`, {
    headers: { Authorization: `Bearer ${dueno.token}`, 'X-Client-App': 'admin' },
  });
  expect(res.ok()).toBeTruthy();
  const [venta] = (await res.json()) as Array<{ total: number; discountTotal: number }>;
  // Papas Pollo 25.000 − 5.000 + Sandwich a 22.000 = 42.000
  expect(venta.discountTotal).toBe(10000);
  expect(venta.total).toBe(42000);
});

test('en la web (teléfono) la tarjeta de Papas no promete nada; el selector descuenta solo Pollo; el Sandwich dice "Hoy $22.000"', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  const card = page.getByRole('button', { name: new RegExp(PAPAS) }).first();
  // El menú público se cachea 30 s: se recarga hasta ver el producto.
  await expect(async () => {
    await page.goto(WEB_URL);
    await expect(card).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });

  await expect(card).not.toContainText('−20%');
  await expect(page.getByRole('button', { name: new RegExp(SANDWICH) }).first()).toContainText('Hoy $22.000');

  await card.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('radio', { name: new RegExp(CARNE) }).check();
  await expect(dialogo.getByText('$ 20.000')).toHaveCount(0);
  await dialogo.getByRole('radio', { name: new RegExp(POLLO) }).check();
  await expect(dialogo.getByText('$ 20.000').first()).toBeVisible();
  await expect(dialogo.getByText('−20%').first()).toBeVisible();
});

test('el dueño limita una promo a una variante y crea una de precio fijo desde el formulario', async ({ page }) => {
  const nombre = `Promo Form ${SUF}`;
  await page.goto('/login');
  await page.locator('#login-email').fill(DUENO_EMAIL);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20_000 });

  await page.goto('/promotions/new');
  await page.getByPlaceholder(/Hamburguesa Nashville/).fill(nombre);
  await page.getByText('Precio fijo', { exact: true }).click();
  await page.getByPlaceholder('22.000').fill('21000');
  // Producto con tamaños: al marcarlo aparecen sus variantes; se limita a Carne.
  await page.getByRole('checkbox', { name: PAPAS }).check();
  const variantes = page.getByRole('group', { name: `Variantes de ${PAPAS}` });
  await expect(variantes.getByRole('button', { name: 'Todas las variantes' })).toHaveAttribute('aria-pressed', 'true');
  await variantes.getByRole('button', { name: CARNE }).click();
  await expect(variantes.getByRole('button', { name: 'Todas las variantes' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Crear promoción' }).click();
  await page.waitForURL((url) => url.pathname === '/promotions', { timeout: 20_000 });

  const res = await api.get(`${API}/promotions`, {
    headers: { Authorization: `Bearer ${dueno.token}`, 'X-Client-App': 'admin' },
  });
  const creada = (
    (await res.json()) as Array<{ id: string; name: string; type: string; fixedPrice: number | null; sizeIdsByProduct?: Record<string, string[]> }>
  ).find((p) => p.name === nombre);
  expect(creada, 'la promo no se creó').toBeTruthy();
  expect(creada!.type).toBe('FIXED_PRICE');
  expect(creada!.fixedPrice).toBe(21000);
  expect(creada!.sizeIdsByProduct).toEqual({ [papasId]: [carneId] });

  // El detalle la describe en palabras: qué tipo, a qué precio y a qué variante.
  await page.goto(`/promotions/${creada!.id}`);
  // `formatCop` separa el símbolo con un espacio duro (U+00A0): `\s` lo cubre, ' ' no.
  await expect(page.getByText(/Se vende a \$\s?21\.000/)).toBeVisible();
  await expect(page.getByText(`· solo ${CARNE}`)).toBeVisible();
});
