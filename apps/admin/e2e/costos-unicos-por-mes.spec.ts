import {
  expect,
  request as playwrightRequest,
  test,
  type Browser,
  type Page,
} from '@playwright/test';
import { businessWallClock } from '@pos-tercos/types';
import { API, DUENO_EMAIL, PASSWORD, authHeaders, login, type Session } from './helpers';

const BASE = 'http://localhost:3004';
const PAGE = '/finanzas/costos-fijos';

/**
 * Los gastos únicos se miran mes a mes. Antes la pantalla listaba TODOS los
 * cargados desde que se abrió el negocio, y el total no correspondía a ningún
 * mes: el dueño en noviembre veía el aceite de septiembre.
 */
test.describe.configure({ timeout: 60_000 });

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function mesDesplazado(delta: number): { year: number; month: number } {
  const hoy = businessWallClock();
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
const ymd = (m: { year: number; month: number }, day: number): string =>
  `${m.year}-${String(m.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const etiqueta = (m: { year: number; month: number }): string => `${MESES[m.month - 1]} ${m.year}`;

const STAMP = Date.now();
const ESTE_MES = mesDesplazado(0);
const MES_PASADO = mesDesplazado(-1);
const HACE_DOS = mesDesplazado(-2);
const DE_ESTE_MES = `Aseo e2e ${STAMP}`;
const DEL_PASADO = `Aceite e2e ${STAMP}`;
const CREADO_EN_UI = `Reparación e2e ${STAMP}`;

let dueno: Session;
let cookies: Awaited<ReturnType<Awaited<ReturnType<Browser['newContext']>>['storageState']>>;

test.beforeAll(async ({ browser }) => {
  const api = await playwrightRequest.newContext();
  dueno = await login(api, DUENO_EMAIL);
  const H = { ...authHeaders(dueno), 'Content-Type': 'application/json' };
  for (const [name, startedAt] of [
    [DE_ESTE_MES, ymd(ESTE_MES, 1)],
    [DEL_PASADO, ymd(MES_PASADO, 15)],
  ] as const) {
    const r = await api.post(`${API}/fixed-costs`, {
      headers: H,
      data: { name, amount: 45_000, frequency: 'ONE_TIME', category: 'Otros', startedAt },
    });
    expect(r.ok(), `crear ${name} → ${r.status()}`).toBeTruthy();
  }
  await api.dispose();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/correo|email/i).fill(DUENO_EMAIL);
  await page.getByLabel(/contraseña/i).fill(PASSWORD);
  await page.getByRole('button', { name: /entrar|ingresar|iniciar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
  cookies = await ctx.storageState();
  await ctx.close();
});

test.afterAll(async () => {
  const api = await playwrightRequest.newContext();
  const H = authHeaders(dueno);
  const r = await api.get(`${API}/fixed-costs`, { headers: H });
  const todos = (await r.json()) as Array<{ id: string; name: string }>;
  for (const c of todos.filter((x) => x.name.includes(String(STAMP)))) {
    await api.delete(`${API}/fixed-costs/${c.id}`, { headers: H });
  }
  await api.dispose();
});

async function abrir(browser: Browser, width = 1366): Promise<Page> {
  const ctx = await browser.newContext({
    storageState: cookies,
    baseURL: BASE,
    viewport: { width, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  return page;
}

test('abre en el mes en curso y cambia de mes con las flechas', async ({ browser }) => {
  const page = await abrir(browser);
  const unicos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Gastos únicos', exact: true }) });

  await expect(unicos.getByText(etiqueta(ESTE_MES), { exact: true })).toBeVisible();
  await expect(unicos.getByText(DE_ESTE_MES)).toBeVisible();
  await expect(unicos.getByText(DEL_PASADO)).toHaveCount(0);
  await expect(page.getByText(`Gastos únicos de ${etiqueta(ESTE_MES)}`)).toBeVisible();

  await unicos.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(unicos.getByText(etiqueta(MES_PASADO), { exact: true })).toBeVisible();
  await expect(unicos.getByText(DEL_PASADO)).toBeVisible();
  await expect(unicos.getByText(DE_ESTE_MES)).toHaveCount(0);
  await expect(page.getByText(`Gastos únicos de ${etiqueta(MES_PASADO)}`)).toBeVisible();

  // Un mes sin gastos no se lee como "no tienes ninguno cargado".
  await unicos.getByRole('button', { name: 'Mes anterior' }).click();
  await unicos.getByRole('button', { name: 'Mes anterior' }).click();
  await unicos.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(unicos.getByText(/^No hay gastos únicos en /)).toBeVisible();
});

test('un gasto guardado con fecha de otro mes salta a ese mes', async ({ browser }) => {
  const page = await abrir(browser);
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder(/Arriendo local/).fill(CREADO_EN_UI);
  await dialog.locator('select').first().selectOption('ONE_TIME');
  await dialog.getByPlaceholder('0').fill('30000');
  await dialog.locator('input[type="date"]').fill(ymd(HACE_DOS, 10));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toHaveCount(0);

  const unicos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Gastos únicos', exact: true }) });
  await expect(unicos.getByText(etiqueta(HACE_DOS), { exact: true })).toBeVisible();
  await expect(unicos.getByText(CREADO_EN_UI)).toBeVisible();
});

test('en celular el selector de mes cabe sin desbordar la página', async ({ browser }) => {
  const page = await abrir(browser, 390);
  const unicos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Gastos únicos', exact: true }) });
  const stepper = unicos.getByRole('button', { name: 'Mes siguiente' });
  await expect(stepper).toBeVisible();
  const box = await stepper.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(390);
  const desborde = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.scrollWidth - main.clientWidth : 0;
  });
  expect(desborde).toBeLessThanOrEqual(0);
});
