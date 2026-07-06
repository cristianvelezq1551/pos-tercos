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
  authHeaders,
  computeExpectedCash,
  ensureOpenShiftToday,
  escapeRegex,
  findSellableProduct,
  login,
  reopenTodayIfClosed,
  type ApiShift,
  type Session,
} from './helpers';

/**
 * Smoke E2E de navegador: login → vender → cobrar → cerrar caja.
 * Corre contra los servers YA levantados (API :3001, POS :3002). El
 * setup/teardown va por API porque la caja es ÚNICA por negocio y UNA por
 * día calendario: el test tiene que adaptarse al estado que encuentre y
 * dejar la caja utilizable al salir.
 */

const CASH_RECEIVED = 200000;

let api: APIRequestContext;
let cajero: Session;
let dueno: Session;
let shift: ApiShift;
/**
 * La caja la cierra quien la abrió o un admin. Si la caja vigente no es del
 * cajero (p.ej. la abrió/reabrió otro usuario), la UI entra como dueño
 * (DUENO es admin → puede cerrar cualquier caja y vender igual).
 */
let uiSession: Session;

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  cajero = await login(api, CAJERO_EMAIL);
  dueno = await login(api, DUENO_EMAIL);
  shift = await ensureOpenShiftToday(api, cajero, dueno);
  uiSession = shift.cashierId === cajero.userId ? cajero : dueno;
});

test.afterAll(async () => {
  // Teardown: dejar la caja utilizable. Si el test la cerró, el dueño la
  // reabre (reopen conserva la sesión del día).
  await reopenTodayIfClosed(api, dueno);
  await api.dispose();
});

test('smoke POS: login → vender → cobrar → cerrar caja', async ({ page }) => {
  await test.step('login UI', async () => {
    await page.goto('/login');
    await page.locator('#login-email').fill(uiSession.email);
    await page.locator('#login-password').fill(PASSWORD);
    // El submit del POS dice "Abrir caja" (submitLabel custom del LoginForm).
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    // Tras login redirige al home (la caja ya está abierta por el setup).
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
  });

  await test.step('agregar un producto al carrito', async () => {
    // El stock real se resuelve por API ANTES de clickear: las tiles arrancan
    // habilitadas hasta que el POS carga la disponibilidad, y clickear una
    // agotada en esa ventana termina en 409 "Stock insuficiente" al cobrar.
    const candidate = await findSellableProduct(api, uiSession);

    // El nombre accesible de la tile es "{categoría} {nombre} ${precio}…" —
    // anclar "nombre + $" evita matchear otro producto que lo contenga.
    const tile = page
      .getByRole('button', { name: new RegExp(`${escapeRegex(candidate.name)}\\s*\\$`) })
      .first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await tile.click();
    // Toda tile abre el ProductPickerModal (con o sin sizes/modifiers).
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(page.getByText('1 ítem', { exact: true })).toBeVisible();
  });

  await test.step('cobrar en efectivo', async () => {
    // Abrir el modal crea la venta e intenta imprimir comanda: si el
    // print-agent local no corre aparece un banner ámbar — es normal.
    await page.getByRole('button', { name: /^Cobrar/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Efectivo', exact: true }).click();
    // Recibido >= total para que el Confirmar se habilite (calcula el cambio).
    await dialog.getByLabel('Recibido').fill(String(CASH_RECEIVED));
    await dialog.getByRole('button', { name: /Confirmar/ }).click();
    // Éxito = banner de última venta con el recibo + carrito vacío. first():
    // el panel de pedidos del día también lista "Recibo #N · pagado".
    await expect(page.getByText(/Recibo #\d+/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Carrito vacío')).toBeVisible();
  });

  await test.step('cerrar caja con cuadre exacto', async () => {
    // El esperado se calcula vía API DESPUÉS de la venta para meterlo como
    // contado y cerrar sin descuadre (no dispara alertas al dueño).
    const expectedCash = await computeExpectedCash(api, uiSession, shift);

    // exact: el topbar también tiene el badge "Ir a Caja" que apunta a /caja.
    await page.getByRole('link', { name: 'Caja', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/caja');
    await page.getByRole('button', { name: 'Cerrar turno' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // El modal carga ventas+movimientos antes de mostrar los controles.
    const arqueo = dialog.getByLabel('Arqueo por denominación');
    await expect(arqueo).toBeVisible({ timeout: 15_000 });
    // Para el smoke: monto directo (sin denominaciones) y sin conteo ciego.
    await arqueo.uncheck();
    await dialog.getByLabel(/Conteo ciego/).uncheck();
    await dialog.getByLabel(/Efectivo contado físicamente/).fill(String(expectedCash));
    await dialog.getByRole('button', { name: 'Cerrar turno' }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // Verificación dura por API: la caja quedó CLOSED y cuadrada.
    const res = await api.get(`${API}/shifts/${shift.id}`, { headers: authHeaders(uiSession) });
    expect(res.ok()).toBeTruthy();
    const closed = (await res.json()) as ApiShift & { difference: number | null };
    expect(closed.status).toBe('CLOSED');
    expect(closed.difference).toBe(0);

    // Y por UI: sin caja abierta, el home gatea hacia /shift/open.
    await page.goto('/');
    await page.waitForURL((url) => url.pathname === '/shift/open', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Abrir turno' })).toBeVisible();
  });
});
