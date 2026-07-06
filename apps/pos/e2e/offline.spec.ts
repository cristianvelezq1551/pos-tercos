import {
  expect,
  request as pwRequest,
  test,
  type APIRequestContext,
} from '@playwright/test';
import {
  API,
  CAJERO_EMAIL,
  DUENO_EMAIL,
  PASSWORD,
  PAID_STATUSES,
  authHeaders,
  ensureOpenShiftToday,
  escapeRegex,
  findSellableProduct,
  login,
  type ApiSale,
  type ApiShift,
  type Session,
} from './helpers';

/**
 * E2E OFFLINE — el corazón del diseño offline-first, que ningún test
 * ejercitaba de punta a punta:
 *   red cortada → el POS detecta offline (heartbeat /healthz ×2 fallos)
 *   → vende y encola en IndexedDB (recibo provisional OFF-N)
 *   → vuelve la red → el sync-engine drena → la venta EXISTE en la DB.
 *
 * El contexto API de Playwright corre en Node (no lo afecta setOffline),
 * así que sirve de observador externo de la DB durante todo el test.
 */

// El heartbeat corre cada 12s y exige 2 fallos seguidos para caer a offline
// (useConnectivity.ts): detectar el corte puede tardar ~25s. Presupuesto ancho.
test.setTimeout(180_000);

let api: APIRequestContext;
let cajero: Session;
let dueno: Session;
let shift: ApiShift;
let uiSession: Session;

async function countPaidSales(s: Session): Promise<number> {
  const res = await api.get(`${API}/sales?shift_id=${shift.id}&limit=200`, {
    headers: authHeaders(s),
  });
  expect(res.ok()).toBeTruthy();
  const sales = (await res.json()) as ApiSale[];
  return sales.filter((sale) => PAID_STATUSES.has(sale.status)).length;
}

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  cajero = await login(api, CAJERO_EMAIL);
  dueno = await login(api, DUENO_EMAIL);
  shift = await ensureOpenShiftToday(api, cajero, dueno);
  uiSession = shift.cashierId === cajero.userId ? cajero : dueno;
});

test.afterAll(async () => {
  await api.dispose();
});

test('offline: vender sin red → reconectar → la venta sincroniza a la DB', async ({
  page,
  context,
}) => {
  const paidBefore = await countPaidSales(uiSession);
  const candidate = await findSellableProduct(api, uiSession);

  await test.step('login y catálogo cargado (aún online)', async () => {
    await page.goto('/login');
    await page.locator('#login-email').fill(uiSession.email);
    await page.locator('#login-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
    // Esperar disponibilidad cargada antes de cortar la red (evita tile 409).
    const tile = page
      .getByRole('button', { name: new RegExp(`${escapeRegex(candidate.name)}\\s*\\$`) })
      .first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
  });

  await test.step('cortar la red → el POS entra en modo offline', async () => {
    await context.setOffline(true);
    // role="status": "Sin conexión — vendiendo offline".
    await expect(page.getByText(/Sin conexión — vendiendo offline/)).toBeVisible({
      timeout: 60_000,
    });
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
    // Offline el botón cambia a "Cobrar offline" — la venta va a IndexedDB.
    await dialog.getByRole('button', { name: /Cobrar offline/ }).click();

    // Banner de última venta con número provisional OFF-N.
    await expect(page.getByText(/cobrada offline/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Carrito vacío')).toBeVisible();
  });

  await test.step('la venta NO está en la DB mientras dura el corte', async () => {
    expect(await countPaidSales(uiSession)).toBe(paidBefore);
  });

  await test.step('reconectar → el sync-engine drena la cola', async () => {
    await context.setOffline(false);
    // El heartbeat detecta la vuelta y el OfflineProvider drena. La venta
    // aparece en la DB como PAGADO con recibo real.
    await expect
      .poll(async () => countPaidSales(uiSession), { timeout: 90_000, intervals: [2_000] })
      .toBe(paidBefore + 1);

    // El banner offline desaparece (operación normal de nuevo).
    await expect(page.getByText(/Sin conexión — vendiendo offline/)).toBeHidden({
      timeout: 60_000,
    });
  });
});
