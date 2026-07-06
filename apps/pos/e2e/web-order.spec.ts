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
  WEB_URL,
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
 * Flujo CROSS-APP completo — la historia más valiosa del sistema:
 * cliente pide en la web pública (:3000) → el POS (:3002) lo ve en Pedidos
 * web → el cajero confirma el pago → marca "listo para retirar" → el cliente
 * ve el cambio de estado en su página de tracking.
 * Ejercita web + API + POS + notificaciones (mock en dev) en una sola pasada.
 */

let api: APIRequestContext;
let cajero: Session;
let dueno: Session;
let shift: ApiShift;
let uiSession: Session;

/** Nombre único por corrida: es la llave para encontrar el pedido en el POS. */
const CUSTOMER = `E2E Web ${Date.now().toString().slice(-6)}`;
const PHONE_10 = '3009876543';

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  cajero = await login(api, CAJERO_EMAIL);
  dueno = await login(api, DUENO_EMAIL);
  // El cobro del pedido web exige caja abierta (se cuelga de la caja vigente).
  shift = await ensureOpenShiftToday(api, cajero, dueno);
  uiSession = shift.cashierId === cajero.userId ? cajero : dueno;
});

test.afterAll(async () => {
  await api.dispose();
});

test('cross-app: pedido web → POS confirma pago → marcar listo → cliente lo ve', async ({
  page,
  context,
}) => {
  let successUrl: string;
  let orderId: string;

  await test.step('cliente arma el pedido en la web pública', async () => {
    const candidate = await findSellableProduct(api, uiSession);
    await page.goto(WEB_URL);

    const card = page
      .getByRole('button', { name: new RegExp(escapeRegex(candidate.name)) })
      .first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    await page.getByRole('button', { name: /Agregar al carrito/ }).click();

    // Topbar → drawer del carrito → checkout. Con ítems el botón del carrito
    // cambia su nombre accesible a "$total · N ítem(s)" (ya no dice "Pedir").
    await page.getByRole('button', { name: /ítem/ }).click();
    await page.getByRole('button', { name: 'Ir a pagar' }).click();
    await page.waitForURL((url) => url.pathname === '/checkout', { timeout: 15_000 });
  });

  await test.step('checkout: datos y confirmación', async () => {
    await page.getByPlaceholder('Como te van a llamar al retirar').fill(CUSTOMER);
    await page.getByPlaceholder('3001234567').fill(PHONE_10);
    await page.getByRole('button', { name: /Confirmar y recibir datos de pago/ }).click();

    await page.waitForURL((url) => url.pathname.startsWith('/checkout/success/'), {
      timeout: 20_000,
    });
    successUrl = page.url();
    orderId = new URL(successUrl).pathname.split('/').pop()!;
    // El tracking arranca pendiente de pago, con instrucciones.
    await expect(page.getByText(/pendiente|transferencia|pago/i).first()).toBeVisible();
  });

  const pos = await context.newPage();

  await test.step('POS: el pedido aparece en Pedidos web', async () => {
    await pos.goto('/login');
    await pos.locator('#login-email').fill(uiSession.email);
    await pos.locator('#login-password').fill(PASSWORD);
    await pos.getByRole('button', { name: 'Abrir caja' }).click();
    await pos.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

    await pos.getByRole('button', { name: /Pedidos web|Nuevo pedido/ }).click();
    const modal = pos.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(CUSTOMER)).toBeVisible({ timeout: 15_000 });
  });

  await test.step('POS: confirmar el pago (transferencia verificada)', async () => {
    const modal = pos.getByRole('dialog');
    // La card del pedido de ESTE run (el modal puede listar otros pendientes).
    const card = modal.locator('li', { hasText: CUSTOMER }).first();
    await card.getByRole('button', { name: 'Confirmar pago' }).click();

    // Modal de confirmación (dialog de arriba) — el WebOrdersModal sigue detrás,
    // así que scopeamos al último dialog para no chocar con "Confirmar pago".
    const confirmDialog = pos.getByRole('dialog').last();
    await confirmDialog
      .getByRole('checkbox', { name: /Confirmo que la transferencia/ })
      .check();
    await confirmDialog.getByRole('button', { name: /Confirmar\s*\$/ }).click();

    // La venta quedó PAGADO — verificación dura por API.
    await expect
      .poll(
        async () => {
          const res = await api.get(`${API}/sales/${orderId}`, { headers: authHeaders(uiSession) });
          if (!res.ok()) return 'error';
          return ((await res.json()) as ApiSale).status;
        },
        { timeout: 15_000 },
      )
      .toBe('PAGADO');
  });

  await test.step('POS: marcar listo para retirar', async () => {
    const modal = pos.getByRole('dialog');
    // Al pagar, la orden pasa a PAGADO y sale de la pestaña "Pend. pago"
    // (filtro por defecto). El cajero cambia a "Por preparar" para verla.
    await modal.getByRole('button', { name: 'Por preparar' }).click();
    const card = modal.locator('li', { hasText: CUSTOMER }).first();
    await card.getByRole('button', { name: 'Marcar listo para retirar' }).click({ timeout: 15_000 });

    await expect
      .poll(
        async () => {
          const res = await api.get(`${API}/sales/${orderId}`, { headers: authHeaders(uiSession) });
          if (!res.ok()) return 'error';
          return ((await res.json()) as ApiSale).status;
        },
        { timeout: 15_000 },
      )
      .toBe('LISTO_DESPACHO');
  });

  await test.step('cliente ve "¡Listo para retirar!" en su tracking', async () => {
    // El poller del cliente refresca cada 5s; recargar hace el assert directo.
    await page.goto(successUrl);
    await expect(page.getByText('¡Listo para retirar!')).toBeVisible({ timeout: 20_000 });
  });
});
