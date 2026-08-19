import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import {
  API,
  DUENO_EMAIL,
  OPERATIVO_EMAIL,
  PAID_STATUSES,
  authHeaders,
  ensureOpenShiftToday,
  escapeRegex,
  findSellableProduct,
  login,
  loginAndEnterCaja,
  type ApiSale,
  type ApiShift,
  type Session,
} from './helpers';

/**
 * E2E OFFLINE de la Caja unificada: red cortada → detecta offline (heartbeat
 * /api/healthz ×2 fallos) → vende y encola en IndexedDB (recibo OFF-N) →
 * vuelve la red → el sync-engine drena → la venta EXISTE en la DB.
 * (No prueba el reload del SW — la SPA queda cargada en memoria; el SW real
 * solo corre en build de prod.)
 */

test.setTimeout(180_000);

let api: APIRequestContext;
let operativo: Session;
let dueno: Session;
let shift: ApiShift;

async function countPaidSales(s: Session): Promise<number> {
  const res = await api.get(`${API}/sales?shift_id=${shift.id}&limit=200`, { headers: authHeaders(s) });
  expect(res.ok()).toBeTruthy();
  const sales = (await res.json()) as ApiSale[];
  return sales.filter((sale) => PAID_STATUSES.has(sale.status)).length;
}

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  operativo = await login(api, OPERATIVO_EMAIL);
  dueno = await login(api, DUENO_EMAIL);
  shift = await ensureOpenShiftToday(api, operativo, dueno);
});

test.afterAll(async () => {
  await api.dispose();
});

test('offline: vender sin red → reconectar → la venta sincroniza a la DB', async ({ page, context }) => {
  const paidBefore = await countPaidSales(operativo);
  const candidate = await findSellableProduct(api, operativo);

  await test.step('login, entrar a Caja y catálogo cargado (aún online)', async () => {
    await loginAndEnterCaja(page, operativo.email);
    const tile = page
      .getByRole('button', { name: new RegExp(`${escapeRegex(candidate.name)}\\s*\\$`) })
      .first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
  });

  await test.step('cortar la red → la caja entra en modo offline', async () => {
    await context.setOffline(true);
    await expect(page.getByText(/Sin conexión — vendiendo offline/)).toBeVisible({ timeout: 60_000 });
  });

  await test.step('vender offline (efectivo, recibo provisional)', async () => {
    const tile = page
      .getByRole('button', { name: new RegExp(`${escapeRegex(candidate.name)}\\s*\\$`) })
      .first();
    await tile.click();
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(page.getByText('1 ítem', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Cobrar/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await dialog.getByLabel('Recibido').fill('200000');
    await dialog.getByRole('button', { name: /Cobrar offline/ }).click();
    await expect(page.getByText(/cobrada offline/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Carrito vacío')).toBeVisible();
  });

  await test.step('la venta NO está en la DB mientras dura el corte', async () => {
    expect(await countPaidSales(operativo)).toBe(paidBefore);
  });

  await test.step('reconectar → el sync-engine drena la cola', async () => {
    await context.setOffline(false);
    await expect
      .poll(async () => countPaidSales(operativo), { timeout: 90_000, intervals: [2_000] })
      .toBe(paidBefore + 1);
    await expect(page.getByText(/Sin conexión — vendiendo offline/)).toBeHidden({ timeout: 60_000 });
  });
});
