import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import {
  API,
  DUENO_EMAIL,
  OPERATIVO_EMAIL,
  authHeaders,
  computeExpectedCash,
  ensureOpenShiftToday,
  escapeRegex,
  findSellableProduct,
  login,
  loginAndEnterCaja,
  reopenTodayIfClosed,
  type ApiShift,
  type Session,
} from './helpers';

/**
 * Smoke E2E de la CAJA unificada: login → launcher → Caja → vender → cobrar →
 * cerrar. Contra los dev servers YA levantados (API :3001, admin :3004).
 */

const CASH_RECEIVED = 200000;

let api: APIRequestContext;
let operativo: Session;
let dueno: Session;
let shift: ApiShift;

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  operativo = await login(api, OPERATIVO_EMAIL);
  dueno = await login(api, DUENO_EMAIL);
  shift = await ensureOpenShiftToday(api, operativo, dueno);
});

test.afterAll(async () => {
  await reopenTodayIfClosed(api, dueno);
  await api.dispose();
});

test('smoke caja: login → launcher → vender → cobrar → cerrar', async ({ page }) => {
  await test.step('login + entrar a Caja desde el launcher', async () => {
    await loginAndEnterCaja(page, operativo.email);
  });

  await test.step('agregar un producto al carrito', async () => {
    const candidate = await findSellableProduct(api, operativo);
    const tile = page
      .getByRole('button', { name: new RegExp(`${escapeRegex(candidate.name)}\\s*\\$`) })
      .first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await tile.click();
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(page.getByText('1 ítem', { exact: true })).toBeVisible();
  });

  await test.step('cobrar en efectivo', async () => {
    await page.getByRole('button', { name: /^Cobrar/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await dialog.getByLabel('Recibido').fill(String(CASH_RECEIVED));
    await dialog.getByRole('button', { name: /Confirmar/ }).click();
    await expect(page.getByText(/Recibo #\d+/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Carrito vacío')).toBeVisible();
  });

  await test.step('cerrar caja con cuadre exacto', async () => {
    const expectedCash = await computeExpectedCash(api, operativo, shift);
    // Pestaña "Caja" de la CajaNav → /caja/cierre (CajaPanel con el cierre).
    await page.locator('a[href="/caja/cierre"]').click();
    await page.waitForURL((url) => url.pathname === '/caja/cierre');
    await page.getByRole('button', { name: 'Cerrar turno' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const arqueo = dialog.getByLabel('Arqueo por denominación');
    await expect(arqueo).toBeVisible({ timeout: 15_000 });
    await arqueo.uncheck();
    await dialog.getByLabel(/Conteo ciego/).uncheck();
    await dialog.getByLabel(/Efectivo contado físicamente/).fill(String(expectedCash));
    await dialog.getByRole('button', { name: 'Cerrar turno' }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const res = await api.get(`${API}/shifts/${shift.id}`, { headers: authHeaders(operativo) });
    expect(res.ok()).toBeTruthy();
    const closed = (await res.json()) as ApiShift & { difference: number | null };
    expect(closed.status).toBe('CLOSED');
    expect(closed.difference).toBe(0);

    // Sin caja abierta, /caja gatea hacia /caja/shift/open.
    await page.goto('/caja');
    await page.waitForURL((url) => url.pathname === '/caja/shift/open', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Abrir turno' })).toBeVisible();
  });
});
