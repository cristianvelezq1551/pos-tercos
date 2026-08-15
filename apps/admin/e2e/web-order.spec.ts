import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import {
  API,
  DUENO_EMAIL,
  OPERATIVO_EMAIL,
  WEB_URL,
  authHeaders,
  ensureOpenShiftToday,
  escapeRegex,
  findSellableProduct,
  login,
  loginAndEnterCaja,
  type ApiSale,
  type Session,
} from './helpers';

/**
 * Cross-app: cliente pide en la web (:3000) → la Caja unificada (admin :3004)
 * lo ve en Pedidos web → confirma el pago → marca "listo" → el cliente lo ve.
 */

let api: APIRequestContext;
let operativo: Session;
let dueno: Session;

const CUSTOMER = `E2E Web ${Date.now().toString().slice(-6)}`;
const PHONE_10 = '3009876543';

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  operativo = await login(api, OPERATIVO_EMAIL);
  dueno = await login(api, DUENO_EMAIL);
  // El cobro del pedido web exige caja abierta (se cuelga de la caja vigente).
  await ensureOpenShiftToday(api, operativo, dueno);
});

test.afterAll(async () => {
  await api.dispose();
});

test('cross-app: pedido web → caja confirma pago → marcar listo → cliente lo ve', async ({
  page,
  context,
}) => {
  let successUrl: string;
  let orderId: string;

  await test.step('cliente arma el pedido en la web pública', async () => {
    const candidate = await findSellableProduct(api, operativo);
    await page.goto(WEB_URL);
    const card = page.getByRole('button', { name: new RegExp(escapeRegex(candidate.name)) }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    await page.getByRole('button', { name: /Agregar al carrito/ }).click();
    await page.getByRole('button', { name: /ítem/ }).click();
    await page.getByRole('button', { name: 'Ir a pagar' }).click();
    await page.waitForURL((url) => url.pathname === '/checkout', { timeout: 15_000 });
  });

  await test.step('checkout: datos y confirmación', async () => {
    await page.getByPlaceholder('Como te van a llamar al retirar').fill(CUSTOMER);
    await page.getByPlaceholder('3001234567').fill(PHONE_10);
    // §7.v26: confirmar abre el chat de WhatsApp en pestaña nueva (popup) y
    // la página principal navega al tracking. El popup (wa.me) se ignora.
    await page.getByRole('button', { name: /Confirmar y abrir WhatsApp/ }).click();
    await page.waitForURL((url) => url.pathname.startsWith('/checkout/success/'), { timeout: 20_000 });
    successUrl = page.url();
    orderId = new URL(successUrl).pathname.split('/').pop()!;
    await expect(page.getByText(/pendiente|transferencia|pago/i).first()).toBeVisible();
  });

  const pos = await context.newPage();

  await test.step('Caja: el pedido aparece en Pedidos web', async () => {
    await loginAndEnterCaja(pos, operativo.email);
    await pos.getByRole('button', { name: /Pedidos web|Nuevo pedido/ }).click();
    const modal = pos.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(CUSTOMER)).toBeVisible({ timeout: 15_000 });
  });

  await test.step('Caja: confirmar el pago (transferencia verificada)', async () => {
    const modal = pos.getByRole('dialog');
    const card = modal.locator('li', { hasText: CUSTOMER }).first();
    await card.getByRole('button', { name: 'Confirmar pago' }).click();
    const confirmDialog = pos.getByRole('dialog').last();
    await confirmDialog.getByRole('checkbox', { name: /Confirmo que la transferencia/ }).check();
    await confirmDialog.getByRole('button', { name: /Confirmar\s*\$/ }).click();
    await expect
      .poll(
        async () => {
          const res = await api.get(`${API}/sales/${orderId}`, { headers: authHeaders(operativo) });
          if (!res.ok()) return 'error';
          return ((await res.json()) as ApiSale).status;
        },
        { timeout: 15_000 },
      )
      .toBe('PAGADO');
  });

  await test.step('Caja: marcar listo para retirar', async () => {
    const modal = pos.getByRole('dialog');
    await modal.getByRole('button', { name: 'Por preparar' }).click();
    const card = modal.locator('li', { hasText: CUSTOMER }).first();
    await card.getByRole('button', { name: 'Marcar listo para retirar' }).click({ timeout: 15_000 });
    await expect
      .poll(
        async () => {
          const res = await api.get(`${API}/sales/${orderId}`, { headers: authHeaders(operativo) });
          if (!res.ok()) return 'error';
          return ((await res.json()) as ApiSale).status;
        },
        { timeout: 15_000 },
      )
      .toBe('LISTO_DESPACHO');
  });

  await test.step('cliente ve "¡Pago confirmado!" en su tracking', async () => {
    // §7.v25: la web ya NO promete el avance del pedido (el canal es WhatsApp).
    // Todo estado pagado-o-posterior (incluido LISTO_DESPACHO) se muestra como
    // "¡Pago confirmado!" con el número de pedido.
    await page.goto(successUrl);
    await expect(page.getByText('¡Pago confirmado!')).toBeVisible({ timeout: 20_000 });
  });
});
