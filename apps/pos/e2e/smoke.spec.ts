import {
  expect,
  request as pwRequest,
  test,
  type APIRequestContext,
} from '@playwright/test';

/**
 * Smoke E2E de navegador: login → vender → cobrar → cerrar caja.
 * Corre contra los dev servers YA levantados (API :3001, POS :3002) y la DB
 * de dev. El setup/teardown va por API porque la caja es ÚNICA por negocio y
 * UNA por día calendario: el test tiene que adaptarse al estado que encuentre
 * y dejar la caja utilizable al salir.
 */

const API = 'http://localhost:3001';
const PASSWORD = 'dev12345';
const CAJERO_EMAIL = 'cajero@dev.local';
const DUENO_EMAIL = 'dueno@dev.local';
const OPENING_CASH = 100000;
const CASH_RECEIVED = 200000;

/** Espejo de PAID_STATUSES del POS: estados donde la venta ya cobró plata. */
const PAID_STATUSES = new Set([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
  'CANCELADO_SIN_REEMBOLSO',
]);

type Session = { token: string; userId: string; email: string };

type ApiShift = {
  id: string;
  cashierId: string;
  openedAt: string;
  openingCash: number;
  status: 'OPEN' | 'CLOSED' | 'RECONCILED';
};

type ApiSalePayment = { method: string; amount: number };
type ApiSale = {
  status: string;
  total: number;
  paymentMethod: string | null;
  payments?: ApiSalePayment[];
};
type ApiCashMovement = { method: string; type: 'IN' | 'OUT'; amount: number };

function authHeaders(s: Session): Record<string, string> {
  return { Authorization: `Bearer ${s.token}` };
}

async function login(api: APIRequestContext, email: string): Promise<Session> {
  // X-Client-App: pos — el guard del API aísla las sesiones por app.
  const res = await api.post(`${API}/auth/login`, {
    headers: { 'X-Client-App': 'pos' },
    data: { email, password: PASSWORD },
  });
  expect(res.ok(), `login ${email} → ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { token: body.accessToken, userId: body.user.id, email };
}

/** El endpoint devuelve body vacío (no "null") cuando no hay caja abierta. */
async function getCurrentShift(api: APIRequestContext, s: Session): Promise<ApiShift | null> {
  const res = await api.get(`${API}/shifts/current`, { headers: authHeaders(s) });
  expect(res.ok()).toBeTruthy();
  const text = await res.text();
  return text ? (JSON.parse(text) as ApiShift) : null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Efectivo esperado en el cajón, con la misma fórmula del backend/POS:
 * apertura + porción CASH de los pagos de ventas cobradas + entradas CASH
 * − salidas CASH. Se calcula vía API justo antes de abrir el modal de cierre
 * para que el conteo cuadre exacto (sin alertas de descuadre).
 */
async function computeExpectedCash(
  api: APIRequestContext,
  s: Session,
  shift: ApiShift,
): Promise<number> {
  const [salesRes, movsRes] = await Promise.all([
    api.get(`${API}/sales?shift_id=${shift.id}&limit=200`, { headers: authHeaders(s) }),
    api.get(`${API}/shifts/${shift.id}/cash-movements`, { headers: authHeaders(s) }),
  ]);
  expect(salesRes.ok()).toBeTruthy();
  expect(movsRes.ok()).toBeTruthy();
  const sales = (await salesRes.json()) as ApiSale[];
  const movements = (await movsRes.json()) as ApiCashMovement[];

  let expected = shift.openingCash;
  for (const sale of sales) {
    if (!PAID_STATUSES.has(sale.status)) continue;
    // sale_payments es la fuente de verdad (cuenta dividida aporta su parte);
    // fallback a paymentMethod para ventas viejas sin payments en el wire.
    const payments =
      sale.payments && sale.payments.length > 0
        ? sale.payments
        : sale.paymentMethod
          ? [{ method: sale.paymentMethod, amount: sale.total }]
          : [];
    for (const p of payments) {
      if (p.method === 'CASH') expected += p.amount;
    }
  }
  for (const m of movements) {
    if (m.method !== 'CASH') continue;
    expected += m.type === 'IN' ? m.amount : -m.amount;
  }
  return expected;
}

/**
 * Garantiza una caja OPEN de HOY antes de tocar la UI:
 * - si ya hay una OPEN de hoy, se usa;
 * - si la OPEN es de un día anterior (stale: bloquea ventas), la cierra el
 *   dueño con el contado = esperado y se abre/reabre la de hoy;
 * - si no hay OPEN: abre una nueva; si ya hubo caja hoy (409 por una-por-día),
 *   el dueño reabre la CLOSED de hoy.
 */
async function ensureOpenShiftToday(
  api: APIRequestContext,
  cajero: Session,
  dueno: Session,
): Promise<ApiShift> {
  let current = await getCurrentShift(api, cajero);

  if (current && !isToday(current.openedAt)) {
    const counted = await computeExpectedCash(api, dueno, current);
    const closeRes = await api.post(`${API}/shifts/${current.id}/close`, {
      headers: authHeaders(dueno),
      data: { countedCash: counted, notes: 'Cierre automático de caja stale (smoke e2e)' },
    });
    expect(closeRes.ok(), `cierre de caja stale → ${closeRes.status()}`).toBeTruthy();
    current = null;
  }

  if (current) return current;

  const openRes = await api.post(`${API}/shifts/open`, {
    headers: authHeaders(cajero),
    data: { openingCash: OPENING_CASH },
  });
  if (openRes.ok()) return (await openRes.json()) as ApiShift;

  // 409 esperado: hoy ya hubo una caja y está CLOSED → el dueño la reabre.
  expect(openRes.status(), 'open debería fallar solo por caja-única/una-por-día').toBe(409);
  const listRes = await api.get(`${API}/shifts?limit=10`, { headers: authHeaders(dueno) });
  expect(listRes.ok()).toBeTruthy();
  const shifts = (await listRes.json()) as ApiShift[];
  const closedToday = shifts.find((s) => s.status === 'CLOSED' && isToday(s.openedAt));
  expect(closedToday, 'no encontré la caja CLOSED de hoy para reabrir').toBeTruthy();
  const reopenRes = await api.post(`${API}/shifts/${closedToday!.id}/reopen`, {
    headers: authHeaders(dueno),
  });
  expect(reopenRes.ok(), `reopen → ${reopenRes.status()}`).toBeTruthy();
  return (await reopenRes.json()) as ApiShift;
}

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
  // reabre (reopen conserva la sesión del día). No falla si no aplica.
  try {
    const current = await getCurrentShift(api, dueno);
    if (!current) {
      const listRes = await api.get(`${API}/shifts?limit=10`, { headers: authHeaders(dueno) });
      if (listRes.ok()) {
        const shifts = (await listRes.json()) as ApiShift[];
        const closedToday = shifts.find((s) => s.status === 'CLOSED' && isToday(s.openedAt));
        if (closedToday) {
          await api.post(`${API}/shifts/${closedToday.id}/reopen`, {
            headers: authHeaders(dueno),
          });
        }
      }
    }
  } catch {
    // best-effort: el teardown nunca debe romper el reporte del test
  } finally {
    await api.dispose();
  }
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
    const [availRes, prodRes] = await Promise.all([
      api.get(`${API}/products/availability`),
      api.get(`${API}/products?only_active=true`, { headers: authHeaders(uiSession) }),
    ]);
    expect(availRes.ok()).toBeTruthy();
    expect(prodRes.ok()).toBeTruthy();
    const availability = (await availRes.json()) as { productId: string; available: boolean }[];
    const availableIds = new Set(
      availability.filter((a) => a.available).map((a) => a.productId),
    );
    const products = (await prodRes.json()) as { id: string; name: string; soldOut: boolean }[];
    const candidate = products.find((p) => availableIds.has(p.id) && !p.soldOut);
    expect(candidate, 'no hay ningún producto vendible en el catálogo').toBeTruthy();

    // El nombre accesible de la tile es "{categoría} {nombre} ${precio}…" —
    // anclar "nombre + $" evita matchear otro producto que lo contenga.
    const escaped = candidate!.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tile = page.getByRole('button', { name: new RegExp(`${escaped}\\s*\\$`) }).first();
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
    // Éxito = banner de última venta con el recibo + carrito vacío.
    await expect(page.getByText(/Recibo #\d+/)).toBeVisible({ timeout: 20_000 });
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
