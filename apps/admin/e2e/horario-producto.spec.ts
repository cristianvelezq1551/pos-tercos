import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { API, DUENO_EMAIL, WEB_URL, authHeaders, login, type Session } from './helpers';

const BASE = 'http://localhost:3004';

/**
 * El HORARIO por producto ("solo los miércoles") en las dos pantallas que se
 * pueden conducir barato: la ficha del admin y el menú del cliente. La lógica
 * del catálogo de la CAJA va en `catalog-horario.test.tsx` — llegar a /caja
 * exige sesión de operativo y turno abierto, y un test de componente dice lo
 * mismo con más precisión y sin gastar otro login.
 *
 * Lo que no puede cubrir un e2e de API: que el cartel diga el motivo real y no
 * "Agotado" —que mentiría sobre la causa— y que la caja no ofrezca algo que el
 * cobro va a rechazar.
 *
 * ⚠️ UN SOLO `POST /auth/login`: el endpoint admite 10 por minuto y por IP, y
 * todo el job comparte esa cuota.
 */

test.describe.configure({ timeout: 90_000 });

let dueno: Session;
let cookies: Awaited<ReturnType<Awaited<ReturnType<Browser['newContext']>>['storageState']>>;
let productoId: string;
let nombre: string;

/** lunes=1 … domingo=64. Igual que el motor de promociones. */
function bitDeHoy(offsetDias = 0): number {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  const dow = d.getDay();
  return dow === 0 ? 64 : 1 << (dow - 1);
}

async function ponerVentanas(api: APIRequestContext, windows: unknown[]) {
  const res = await api.put(`${API}/products/${productoId}/availability-windows`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    data: { windows },
  });
  expect(res.ok(), `ventanas → ${res.status()} ${await res.text()}`).toBeTruthy();
}

test.beforeAll(async ({ browser }) => {
  const api = await playwrightRequest.newContext();
  dueno = await login(api, DUENO_EMAIL);

  const cats = await api.get(`${API}/product-categories`, { headers: authHeaders(dueno) });
  const lista = (await cats.json()) as Array<{ name: string; isActive?: boolean }>;
  const categoria = (lista.find((c) => c.isActive !== false) ?? lista[0]).name;

  nombre = `Combo horario ${Date.now()}`;
  const crear = await api.post(`${API}/products`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    data: {
      name: nombre,
      category: categoria,
      basePrice: 30000,
      directResale: true,
      unitPurchase: 'caja',
      unitStock: 'unidad',
      conversionFactor: 24,
    },
  });
  expect(crear.ok(), `crear producto → ${crear.status()}`).toBeTruthy();
  productoId = ((await crear.json()) as { id: string }).id;

  await api.post(`${API}/inventory/movements`, {
    headers: { ...authHeaders(dueno), 'Content-Type': 'application/json' },
    data: { entityType: 'PRODUCT', productId: productoId, type: 'INITIAL', delta: 200, note: 'stock' },
  });
  await api.dispose();

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: 'admin_access', value: dueno.token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
  cookies = await ctx.storageState();
  await ctx.close();
});

async function pestana(browser: Browser, baseURL = BASE): Promise<Page> {
  const ctx = await browser.newContext({ storageState: cookies, baseURL });
  return ctx.newPage();
}

test('la ficha del producto deja definir los días en que se vende', async ({ browser }) => {
  const page = await pestana(browser);
  await page.goto(`/products/${productoId}`);

  await expect(page.getByText('Cuándo se puede vender')).toBeVisible();
  // Sin franjas, la pantalla dice que se vende siempre.
  await expect(page.getByText(/Se vende todos los días/)).toBeVisible();

  await page.getByRole('button', { name: 'Agregar franja' }).click();
  // Sin días elegidos no se puede guardar: una franja vacía dejaría el
  // producto invendible sin decir por qué.
  await expect(page.getByRole('button', { name: 'Guardar horario' })).toBeDisabled();
  await expect(page.getByText('Elige al menos un día.')).toBeVisible();

  await page.getByText('X', { exact: true }).click(); // miércoles
  await page.getByRole('button', { name: 'Guardar horario' }).click();
  await expect(page.getByText('Horario guardado.')).toBeVisible();

  await page.close();
});

test('el cliente de la web ve el motivo, no un "Agotado" que mentiría', async ({ browser }) => {
  const api = await playwrightRequest.newContext();
  await ponerVentanas(api, [{ daysOfWeekMask: bitDeHoy(1) }]);
  await api.dispose();

  const page = await pestana(browser, WEB_URL);
  await page.goto('/');
  const card = page.getByText(nombre, { exact: false }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Solo /).first()).toBeVisible();

  await page.close();
});
