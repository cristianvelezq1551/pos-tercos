import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Helpers compartidos de los e2e de navegador. El setup/teardown va por API
 * porque la caja es ÚNICA por negocio y UNA por día calendario: cada spec se
 * adapta al estado que encuentra y deja la caja utilizable al salir.
 */

export const API = 'http://localhost:3001';
export const WEB_URL = 'http://localhost:3000';
export const COCINA_URL = 'http://localhost:3006';
export const PASSWORD = 'dev12345';
export const CAJERO_EMAIL = 'cajero@dev.local';
export const DUENO_EMAIL = 'dueno@dev.local';
export const ADMIN_EMAIL = 'admin@dev.local';
export const COCINERO_EMAIL = 'cocinero@dev.local';
export const OPENING_CASH = 100000;

/** Espejo de PAID_STATUSES del POS: estados donde la venta ya cobró plata. */
export const PAID_STATUSES = new Set([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
  'CANCELADO_SIN_REEMBOLSO',
]);

export type Session = { token: string; userId: string; email: string };

export type ApiShift = {
  id: string;
  cashierId: string;
  openedAt: string;
  openingCash: number;
  status: 'OPEN' | 'CLOSED' | 'RECONCILED';
};

export type ApiSalePayment = { method: string; amount: number };
export type ApiSale = {
  id: string;
  status: string;
  total: number;
  receiptNumber: number;
  paymentMethod: string | null;
  payments?: ApiSalePayment[];
};
export type ApiCashMovement = { method: string; type: 'IN' | 'OUT'; amount: number };

export function authHeaders(s: Session): Record<string, string> {
  return { Authorization: `Bearer ${s.token}` };
}

export async function login(
  api: APIRequestContext,
  email: string,
  app: 'pos' | 'admin' | 'cocina' = 'pos',
): Promise<Session> {
  // X-Client-App — el guard del API aísla las sesiones por app.
  const res = await api.post(`${API}/auth/login`, {
    headers: { 'X-Client-App': app },
    data: { email, password: PASSWORD },
  });
  expect(res.ok(), `login ${email} → ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { token: body.accessToken, userId: body.user.id, email };
}

/** El endpoint devuelve body vacío (no "null") cuando no hay caja abierta. */
export async function getCurrentShift(
  api: APIRequestContext,
  s: Session,
): Promise<ApiShift | null> {
  const res = await api.get(`${API}/shifts/current`, { headers: authHeaders(s) });
  expect(res.ok()).toBeTruthy();
  const text = await res.text();
  return text ? (JSON.parse(text) as ApiShift) : null;
}

export function isToday(iso: string): boolean {
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
 * − salidas CASH.
 */
export async function computeExpectedCash(
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
export async function ensureOpenShiftToday(
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

/** Reabre la caja CLOSED de hoy si el spec la dejó cerrada (teardown común). */
export async function reopenTodayIfClosed(
  api: APIRequestContext,
  dueno: Session,
): Promise<void> {
  try {
    const current = await getCurrentShift(api, dueno);
    if (current) return;
    const listRes = await api.get(`${API}/shifts?limit=10`, { headers: authHeaders(dueno) });
    if (!listRes.ok()) return;
    const shifts = (await listRes.json()) as ApiShift[];
    const closedToday = shifts.find((s) => s.status === 'CLOSED' && isToday(s.openedAt));
    if (closedToday) {
      await api.post(`${API}/shifts/${closedToday.id}/reopen`, { headers: authHeaders(dueno) });
    }
  } catch {
    // best-effort: el teardown nunca debe romper el reporte del test
  }
}

/** Primer producto del catálogo vendible AHORA (activo, con stock, sin "86"). */
export async function findSellableProduct(
  api: APIRequestContext,
  s: Session,
): Promise<{ id: string; name: string }> {
  const [availRes, prodRes] = await Promise.all([
    api.get(`${API}/products/availability`),
    api.get(`${API}/products?only_active=true`, { headers: authHeaders(s) }),
  ]);
  expect(availRes.ok()).toBeTruthy();
  expect(prodRes.ok()).toBeTruthy();
  const availability = (await availRes.json()) as { productId: string; available: boolean }[];
  const availableIds = new Set(availability.filter((a) => a.available).map((a) => a.productId));
  const products = (await prodRes.json()) as { id: string; name: string; soldOut: boolean }[];
  const candidate = products.find((p) => availableIds.has(p.id) && !p.soldOut);
  expect(candidate, 'no hay ningún producto vendible en el catálogo').toBeTruthy();
  return candidate!;
}

/** Escapa un nombre para usarlo dentro de un RegExp de selector. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
