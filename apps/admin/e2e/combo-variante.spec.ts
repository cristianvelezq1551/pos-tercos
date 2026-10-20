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
 * El combo cuyo componente lleva VARIANTE, en la interfaz real
 * (PLAN-COMBO-CON-VARIANTE.md, entrega 2): "2 Papas TERCOS · Pollo y Miel
 * ahumada por $40.000", armado desde el formulario como lo arma el dueño.
 *
 * Un e2e de API no ve esto: lo que se prueba es qué se muestra, qué se puede
 * elegir y que lo elegido en pantalla es lo que queda guardado.
 *
 * ⚠️ UN SOLO `POST /auth/login` en todo el archivo (el job entero comparte el
 * cupo de 10 por minuto y por IP): la sesión del navegador se siembra con la
 * cookie de esa misma sesión de API.
 */

test.describe.configure({ timeout: 90_000 });

let dueno: Session;
let cookies: Awaited<ReturnType<Awaited<ReturnType<Browser['newContext']>>['storageState']>>;
let categoria: string;
let papasNombre: string;
let papasId: string;
let polloId: string;
let sandwichNombre: string;
let comboVaradoNombre: string;
let comboVaradoId: string;

const sufijo = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function api(
  ctx: APIRequestContext,
  metodo: 'post' | 'put',
  ruta: string,
  data: unknown,
): Promise<{ id: string; sizes?: Array<{ id: string; name: string }> }> {
  const res = await ctx[metodo](`${API}${ruta}`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    data,
  });
  expect(res.ok(), `${metodo.toUpperCase()} ${ruta} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as { id: string; sizes?: Array<{ id: string; name: string }> };
}

test.beforeAll(async ({ browser }) => {
  const ctx = await playwrightRequest.newContext();
  dueno = await login(ctx, DUENO_EMAIL);
  const s = sufijo();

  const cats = await ctx.get(`${API}/product-categories`, { headers: authHeaders(dueno) });
  const lista = (await cats.json()) as Array<{ name: string; isActive?: boolean }>;
  categoria = (lista.find((c) => c.isActive !== false) ?? lista[0]).name;

  papasNombre = `Papas UI ${s}`;
  const papas = await api(ctx, 'post', '/products', {
    name: papasNombre,
    category: categoria,
    basePrice: 25_000,
    sizes: [
      { name: 'Pollo y Miel ahumada', priceModifier: 0, sortOrder: 0 },
      { name: 'Carne smash doble', priceModifier: 3000, sortOrder: 1 },
    ],
  });
  papasId = papas.id;
  polloId = papas.sizes!.find((z) => z.name === 'Pollo y Miel ahumada')!.id;

  sandwichNombre = `Sandwich UI ${s}`;
  const sandwich = await api(ctx, 'post', '/products', { name: sandwichNombre, category: categoria, basePrice: 18_000 });

  // Un combo que queda "varado": su plato gana variantes DESPUÉS de entrar al
  // combo (por la pantalla no se puede, por el API sí). La lista lo tiene que avisar.
  comboVaradoNombre = `Combo varado ${s}`;
  comboVaradoId = (
    await api(ctx, 'post', '/products', {
      name: comboVaradoNombre,
      category: categoria,
      basePrice: 18_000,
      isCombo: true,
      comboPrice: 18_000,
      comboComponents: [{ productId: sandwich.id, quantity: 1 }],
    })
  ).id;
  await api(ctx, 'put', `/products/${sandwich.id}/options`, {
    sizes: [{ name: 'Clásico', priceModifier: 0, sortOrder: 0 }],
    modifiers: [],
  });
  await ctx.dispose();

  const tmp = await browser.newContext();
  await tmp.addCookies([
    { name: 'admin_access', value: dueno.token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
  cookies = await tmp.storageState();
  await tmp.close();
});

async function pestana(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: cookies, baseURL: BASE });
  return ctx.newPage();
}

async function abrirComboNuevo(page: Page, nombre: string): Promise<void> {
  await page.goto('/products/new');
  await page.getByRole('button', { name: /Combo/ }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(nombre);
  await page.locator('#category').selectOption(categoria);
  await page.locator('#basePrice').fill('40000');
  await page.locator('#comboPrice').fill('40000');
}

test('armar "2 Papas · Pollo" desde el formulario guarda la variante elegida', async ({ browser }) => {
  const page = await pestana(browser);
  const nombre = `2 Papas pollo UI ${sufijo()}`;
  await abrirComboNuevo(page, nombre);

  await page.getByLabel('Producto', { exact: true }).first().selectOption(papasId);
  const variante = page.getByLabel(`Variante de ${papasNombre}`);
  await expect(variante).toBeVisible();
  // Obligatoria y sin nada elegido: no se puede guardar el combo sin decir cuál.
  await expect(variante).toHaveValue('');
  await variante.selectOption(polloId);
  await page.getByLabel('Cantidad', { exact: true }).first().fill('2');
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await page.waitForURL(/\/products$/);

  const ctx = await playwrightRequest.newContext();
  const productos = (await (await ctx.get(`${API}/products`, { headers: authHeaders(dueno) })).json()) as Array<{
    id: string;
    name: string;
    comboComponents: Array<{ productId: string; sizeId?: string | null; quantity: number }>;
  }>;
  const creado = productos.find((p) => p.name === nombre);
  expect(creado?.comboComponents).toEqual([
    expect.objectContaining({ productId: papasId, sizeId: polloId, quantity: 2 }),
  ]);

  // La ficha del combo dice qué variante descuenta.
  await page.goto(`/products/${creado!.id}/recipe`);
  await expect(page.getByText(new RegExp(`${papasNombre} · Pollo y Miel ahumada`))).toBeVisible();
  await ctx.dispose();
  await page.close();
});

test('sin elegir la variante el combo NO se guarda', async ({ browser }) => {
  const page = await pestana(browser);
  await abrirComboNuevo(page, `Combo sin variante UI ${sufijo()}`);
  await page.getByLabel('Producto', { exact: true }).first().selectOption(papasId);
  await page.getByRole('button', { name: 'Crear producto' }).click();
  // El navegador frena el envío por el campo obligatorio: seguimos en el formulario.
  await expect(page).toHaveURL(/\/products\/new$/);
  await expect(page.getByLabel(`Variante de ${papasNombre}`)).toBeVisible();
  await page.close();
});

test('un plato con variantes no se ofrece como opción a elegir, y la pantalla dice por qué', async ({ browser }) => {
  const page = await pestana(browser);
  await abrirComboNuevo(page, `Combo con grupo UI ${sufijo()}`);
  await page.getByRole('button', { name: /Agregar grupo para elegir/ }).click();
  const opcion = page.getByLabel('Opción', { exact: true }).first();
  await expect(opcion.locator('option', { hasText: papasNombre })).toHaveCount(0);
  await expect(page.getByText(/con variantes no aparecen como opción/i)).toBeVisible();
  await page.close();
});

test('la lista de productos avisa del combo que quedó sin variante, con su enlace', async ({ browser }) => {
  const page = await pestana(browser);
  await page.goto('/products');
  const aviso = page.getByRole('alert').filter({ hasText: comboVaradoNombre });
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText(sandwichNombre);
  await aviso.getByRole('link', { name: comboVaradoNombre }).click();
  await page.waitForURL(new RegExp(`/products/${comboVaradoId}`));
  // En el combo, la fila del plato pide elegir la variante.
  await expect(page.getByText(/tiene variantes: elige cuál lleva el combo/i)).toBeVisible();
  await page.close();
});
