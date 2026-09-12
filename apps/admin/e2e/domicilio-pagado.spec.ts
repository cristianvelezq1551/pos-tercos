import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import {
  API,
  DUENO_EMAIL,
  OPERATIVO_EMAIL,
  authHeaders,
  ensureOpenShiftToday,
  login,
  type ApiShift,
  type Session,
} from './helpers';

/**
 * El domicilio pagado del cajón, en la pantalla real (§7.v71).
 *
 * Lo que un e2e de API no puede cubrir es lo que este proyecto ya sufrió tres
 * veces: que el número del backend esté bien y la pantalla muestre otra cosa,
 * o no muestre nada. Acá se MIDE lo que el cajero lee: el esperado en caja
 * después de registrarlo, y que el reporte de cierre lo nombre en su propia
 * línea en vez de esconderlo dentro de "Salidas de efectivo".
 *
 * ⚠️ UN SOLO `POST /auth/login` por sesión en todo el archivo: el endpoint
 * admite 10 por minuto y por IP y el job entero comparte esa cuota.
 */

test.describe.configure({ timeout: 90_000 });

const DOMICILIO = 7_000;

let operativo: Session;
let dueno: Session;
let shift: ApiShift;
let cookies: Awaited<ReturnType<Awaited<ReturnType<Browser['newContext']>>['storageState']>>;

test.beforeAll(async ({ browser }) => {
  const api: APIRequestContext = await playwrightRequest.newContext();
  operativo = await login(api, OPERATIVO_EMAIL);
  dueno = await login(api, DUENO_EMAIL);
  shift = await ensureOpenShiftToday(api, operativo, dueno);

  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: 'admin_access',
      value: operativo.token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  cookies = await ctx.storageState();
  await ctx.close();
  await api.dispose();
});

/** Deja la caja sin domicilios, pase lo que pase con las aserciones. */
test.afterAll(async () => {
  const api = await playwrightRequest.newContext();
  const res = await api.get(`${API}/shifts/${shift.id}/cash-movements`, {
    headers: authHeaders(operativo),
  });
  if (res.ok()) {
    const movs = (await res.json()) as Array<{ pairId: string | null; type: string }>;
    const pares = new Set(movs.filter((m) => m.pairId).map((m) => m.pairId as string));
    for (const pairId of pares) {
      await api.delete(`${API}/shifts/${shift.id}/delivery-payout/${pairId}`, {
        headers: authHeaders(operativo),
      });
    }
  }
  await api.dispose();
});

/**
 * La pantalla de Caja del turno vive en `/caja/cierre` — `/caja` es la de
 * vender. Se espera al reporte de cierre porque el panel carga sus datos en el
 * cliente: sin esa espera, las aserciones corren contra una pantalla vacía.
 */
async function abrirCaja(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: cookies });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3004/caja/cierre');
  await expect(page.getByText('Reporte de cierre del turno')).toBeVisible({ timeout: 30_000 });
  return page;
}

/** La sección nueva, por su nombre accesible (no por su texto suelto). */
const seccionDomicilios = (page: Page) =>
  page.getByRole('region', { name: 'Domicilios pagados del cajón' });

const reporteDeCierre = (page: Page) =>
  page.locator('section', { hasText: 'Reporte de cierre del turno' }).first();

/** El "Esperado en caja" que el cajero lee en el reporte de cierre. */
async function esperadoEnPantalla(page: Page): Promise<number> {
  const texto = await reporteDeCierre(page)
    .getByText('Esperado en caja', { exact: true })
    .locator('xpath=..')
    .innerText();
  const numero = texto.replace(/[^\d-]/g, '');
  expect(numero.length, `no pude leer el esperado: "${texto}"`).toBeGreaterThan(0);
  return Number(numero);
}

test('la sección explica cuándo se usa y cuándo no', async ({ browser }) => {
  const page = await abrirCaja(browser);
  const seccion = seccionDomicilios(page);
  await expect(seccion).toBeVisible();
  // Lo que evita el error de operación: registrar también los de efectivo.
  await expect(seccion).toContainText('Si el cliente pagó todo en efectivo, no registres nada');
  await page.close();
});

test('registrarlo baja el esperado en caja y lo dice con nombre propio', async ({ browser }) => {
  const page = await abrirCaja(browser);
  const antes = await esperadoEnPantalla(page);

  const seccion = seccionDomicilios(page);
  await seccion.getByLabel('Valor del domicilio').fill(String(DOMICILIO));
  await seccion.getByLabel('Referencia (opcional)').fill('pedido de la 30');
  await seccion.getByRole('button', { name: 'Registrar' }).click();

  // La fila del domicilio aparece con su referencia.
  await expect(seccion.getByText('pedido de la 30')).toBeVisible({ timeout: 15_000 });

  // Y el reporte de cierre lo nombra en SU línea, no dentro de las salidas.
  const reporte = reporteDeCierre(page);
  await expect(reporte.getByText(/Domicilios pagados del cajón \(1\)/)).toBeVisible();
  await expect(reporte).toContainText('esa misma plata está en la cuenta');

  // Lo que de verdad importa: el número que el cajero va a contra-contar.
  await expect
    .poll(async () => esperadoEnPantalla(page), { timeout: 15_000 })
    .toBe(antes - DOMICILIO);
  await page.close();
});

test('quitarlo devuelve el esperado y la línea desaparece', async ({ browser }) => {
  const page = await abrirCaja(browser);
  const seccion = seccionDomicilios(page);
  await expect(seccion.getByText('pedido de la 30')).toBeVisible({ timeout: 15_000 });
  const conDomicilio = await esperadoEnPantalla(page);

  // Dos toques, como cualquier borrado de la caja.
  const quitar = seccion.getByRole('button', { name: 'Quitar el domicilio' });
  await quitar.click();
  await seccion.getByRole('button', { name: 'Confirmar que se quita el domicilio' }).click();

  await expect(seccion.getByText('pedido de la 30')).toBeHidden({ timeout: 15_000 });
  const reporte = reporteDeCierre(page);
  await expect(reporte.getByText(/Domicilios pagados del cajón/)).toBeHidden();
  await expect
    .poll(async () => esperadoEnPantalla(page), { timeout: 15_000 })
    .toBe(conDomicilio + DOMICILIO);
  await page.close();
});

test('el botón de quitar cumple el piso táctil de 44 px', async ({ browser }) => {
  const page = await abrirCaja(browser);
  const seccion = seccionDomicilios(page);
  await seccion.getByLabel('Valor del domicilio').fill('3000');
  await seccion.getByRole('button', { name: 'Registrar' }).click();
  const quitar = seccion.getByRole('button', { name: 'Quitar el domicilio' });
  await expect(quitar).toBeVisible({ timeout: 15_000 });
  // offsetHeight y no boundingBox: el rect se mide a mitad de una transición
  // y devuelve menos de lo que el layout tiene (§7.v65).
  const alto = await quitar.evaluate((el) => (el as HTMLElement).offsetHeight);
  expect(alto).toBeGreaterThanOrEqual(44);
  await page.close();
});
