import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { API, DUENO_EMAIL, authHeaders, login, type Session } from './helpers';

const BASE = 'http://localhost:3004';

/**
 * Las recetas que NUNCA se consumen, en la interfaz real: la de un combo y la
 * de una reventa directa.
 *
 * Un combo no lleva receta propia: al venderlo se descuenta el stock de sus
 * componentes (`computeConsumptionSpecs` recorre `comboComponents`). La página
 * mostraba igual el editor de receta vacío con el cartel "sin insumos para
 * descontar al vender 1 unidad" — falso, y hacía creer que la venta no movía
 * el inventario. Peor: dejaba GUARDAR una receta que nadie iba a consumir.
 *
 * Esto no lo puede cubrir un e2e de API: lo que se rompe es qué se renderiza.
 *
 * ⚠️ UN SOLO `POST /auth/login` en todo el archivo: el endpoint admite 10 por
 * minuto y por IP, y el job entero comparte esa cuota. La sesión del navegador
 * se siembra plantando la cookie con el token de esa misma sesión de API, en
 * vez de gastar un segundo login en el formulario.
 */

test.describe.configure({ timeout: 90_000 });

let dueno: Session;
let cookies: Awaited<ReturnType<Awaited<ReturnType<Browser['newContext']>>['storageState']>>;
let comboId: string;
let preparadoId: string;
let bebidaId: string;
let insumoId: string;
/** Una categoría que exista en ESTA base: `products.create` la exige. */
let categoria: string;

const sufijo = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function crearProducto(
  api: APIRequestContext,
  data: Record<string, unknown>,
): Promise<string> {
  const res = await api.post(`${API}/products`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    data,
  });
  expect(res.ok(), `crear producto → ${res.status()} ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

test.beforeAll(async ({ browser }) => {
  const api = await playwrightRequest.newContext();
  dueno = await login(api, DUENO_EMAIL);
  const s = sufijo();

  const cats = await api.get(`${API}/product-categories`, { headers: authHeaders(dueno) });
  expect(cats.ok(), `categorías → ${cats.status()}`).toBeTruthy();
  const lista = (await cats.json()) as Array<{ name: string; isActive?: boolean }>;
  const primera = lista.find((c) => c.isActive !== false) ?? lista[0];
  expect(primera, 'la base de dev necesita al menos una categoría').toBeTruthy();
  categoria = primera.name;

  // Un insumo con costo, para que el combo tenga un número real que mostrar.
  const insumoRes = await api.post(`${API}/ingredients`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    data: {
      name: `Pan combo ${s}`,
      unitPurchase: 'paquete',
      unitRecipe: 'unidad',
      conversionFactor: 10,
      thresholdMin: 0,
    },
  });
  expect(insumoRes.ok()).toBeTruthy();
  insumoId = ((await insumoRes.json()) as { id: string }).id;

  preparadoId = await crearProducto(api, {
    name: `Hamburguesa combo ${s}`,
    category: categoria,
    basePrice: 20000,
  });
  await api.put(`${API}/products/${preparadoId}/recipe`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    data: { edges: [{ childType: 'ingredient', childId: insumoId, quantityNeta: 1, mermaPct: 0 }] },
  });

  bebidaId = await crearProducto(api, {
    name: `Gaseosa combo ${s}`,
    category: categoria,
    basePrice: 4000,
    directResale: true,
    unitPurchase: 'caja',
    unitStock: 'unidad',
    conversionFactor: 24,
  });

  comboId = await crearProducto(api, {
    name: `Combo prueba ${s}`,
    category: categoria,
    basePrice: 0,
    isCombo: true,
    comboPrice: 40000,
    comboComponents: [
      { productId: preparadoId, quantity: 2 },
      { productId: bebidaId, quantity: 2 },
    ],
  });
  await api.dispose();

  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: 'admin_access',
      value: dueno.token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  cookies = await ctx.storageState();
  await ctx.close();
});

async function pestanaAutenticada(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: cookies, baseURL: BASE });
  return ctx.newPage();
}

test('la receta de un combo explica qué descuenta, en vez del editor vacío', async ({
  browser,
}) => {
  const page = await pestanaAutenticada(browser);
  await page.goto(`/products/${comboId}/recipe`);

  await expect(page.getByText('Este combo no lleva receta propia')).toBeVisible();
  await expect(page.getByText('Qué descuenta al vender 1 combo')).toBeVisible();

  // El cartel que hacía creer que la venta no descontaba nada.
  await expect(page.getByText(/sin insumos para descontar/i)).toHaveCount(0);
  // Y el editor no se ofrece: guardar acá no tendría ningún efecto.
  await expect(page.getByRole('button', { name: /Agregar/ })).toHaveCount(0);
  await expect(page.getByText(/Agregar item a la receta/i)).toHaveCount(0);

  // Cada componente, con su cantidad y de dónde sale el descuento.
  await expect(page.getByText(/2× Hamburguesa combo/)).toBeVisible();
  await expect(page.getByText(/2× Gaseosa combo/)).toBeVisible();
  await expect(page.getByText(/descuenta los insumos de su receta/i)).toBeVisible();
  await expect(page.getByText(/descuenta su propio stock/i)).toBeVisible();

  await page.close();
});

test('el componente preparado enlaza a SU receta, que sí se edita', async ({ browser }) => {
  const page = await pestanaAutenticada(browser);
  await page.goto(`/products/${comboId}/recipe`);

  await page.getByRole('link', { name: /Ver su receta/i }).first().click();
  await page.waitForURL(new RegExp(`/products/${preparadoId}/recipe`));
  // Ahí sí vive el editor: es la receta que de verdad se consume.
  await expect(page.getByText(/Agregar item a la receta/i)).toBeVisible();

  await page.close();
});

test('una bebida de reventa tampoco ofrece el editor: descuenta su propio stock', async ({
  browser,
}) => {
  const page = await pestanaAutenticada(browser);
  await page.goto(`/products/${bebidaId}/recipe`);

  await expect(page.getByText(/no lleva receta/i)).toBeVisible();
  await expect(page.getByText(/una unidad de su propio stock/i)).toBeVisible();
  // Ofrecer el editor sería una acción que el servidor siempre rechaza.
  await expect(page.getByText(/Agregar item a la receta/i)).toHaveCount(0);

  await page.close();
});

test('el servidor rechaza guardarle una receta al combo y a la reventa', async () => {
  const api = await playwrightRequest.newContext();
  const res = await api.put(`${API}/products/${comboId}/recipe`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    // Un insumo REAL: así el 400 sale del guard y no de "el hijo no existe".
    data: { edges: [{ childType: 'ingredient', childId: insumoId, quantityNeta: 1, mermaPct: 0 }] },
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain('combo');

  const bebida = await api.put(`${API}/products/${bebidaId}/recipe`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    data: { edges: [{ childType: 'ingredient', childId: insumoId, quantityNeta: 1, mermaPct: 0 }] },
  });
  expect(bebida.status()).toBe(400);
  expect(await bebida.text()).toContain('reventa directa');
  await api.dispose();
});
