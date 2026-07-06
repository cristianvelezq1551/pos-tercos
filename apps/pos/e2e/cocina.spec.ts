import {
  expect,
  request as pwRequest,
  test,
  type APIRequestContext,
} from '@playwright/test';
import {
  API,
  COCINA_URL,
  COCINERO_EMAIL,
  DUENO_EMAIL,
  PASSWORD,
  authHeaders,
  login,
  type Session,
} from './helpers';

/**
 * Smoke E2E de la app de COCINA (:3006): login por cookie → ver stock →
 * registrar una producción real.
 *
 * ⚠️ REGRESIÓN de navegador del bug 2026-07-06: el guard del API no conocía
 * la cookie `cocina_access` y TODA la app daba 401. Los e2e de API no lo
 * atrapaban (usan Bearer) — este spec ejercita el camino real del navegador.
 *
 * Fixtures: el seed no crea insumos/subproductos, así que el spec crea los
 * suyos vía API con nombres fijos "[E2E] …" (idempotente: reusa si existen).
 */

const ING_NAME = '[E2E] Harina Test';
const SUB_NAME = '[E2E] Masa Test';
/** Una tanda rinde 10 porciones y consume 100 g de harina. */
const SUB_YIELD = 10;
const RECIPE_QTY_G = 100;
const PRODUCE_QTY = 10;

type ApiIngredient = { id: string; name: string };
type ApiSubproduct = { id: string; name: string; isActive?: boolean };
type ProductionStatus = { id: string; name: string; currentStock: number };

let api: APIRequestContext;
let dueno: Session;
let cocinero: Session;
let subproductId: string;

async function ensureIngredient(): Promise<string> {
  const listRes = await api.get(`${API}/ingredients`, { headers: authHeaders(dueno) });
  expect(listRes.ok()).toBeTruthy();
  const existing = ((await listRes.json()) as ApiIngredient[]).find((i) => i.name === ING_NAME);
  if (existing) return existing.id;

  const createRes = await api.post(`${API}/ingredients`, {
    headers: authHeaders(dueno),
    data: { name: ING_NAME, unitPurchase: 'kg', unitRecipe: 'g', conversionFactor: 1000 },
  });
  expect(createRes.ok(), `crear ingrediente → ${createRes.status()}`).toBeTruthy();
  const created = (await createRes.json()) as ApiIngredient;

  // Stock inicial generoso: cada corrida consume RECIPE_QTY_G.
  const movRes = await api.post(`${API}/inventory/movements`, {
    headers: authHeaders(dueno),
    data: {
      entityType: 'INGREDIENT',
      ingredientId: created.id,
      delta: 100000,
      type: 'INITIAL',
      unitCost: 5,
      notes: 'Fixture e2e navegador (cocina.spec)',
    },
  });
  expect(movRes.ok(), `stock inicial → ${movRes.status()}`).toBeTruthy();
  return created.id;
}

async function ensureSubproduct(ingredientId: string): Promise<string> {
  const listRes = await api.get(`${API}/subproducts`, { headers: authHeaders(dueno) });
  expect(listRes.ok()).toBeTruthy();
  const existing = ((await listRes.json()) as ApiSubproduct[]).find((s) => s.name === SUB_NAME);

  let id: string;
  if (existing) {
    id = existing.id;
  } else {
    const createRes = await api.post(`${API}/subproducts`, {
      headers: authHeaders(dueno),
      data: { name: SUB_NAME, yield: SUB_YIELD, unit: 'porción' },
    });
    expect(createRes.ok(), `crear subproducto → ${createRes.status()}`).toBeTruthy();
    id = ((await createRes.json()) as ApiSubproduct).id;
  }

  // Setear la receta SIEMPRE (idempotente): una corrida previa pudo dejar el
  // subproducto sin receta → la producción no consumiría nada y el assert de
  // "Se descontó del inventario" fallaría.
  const recipeRes = await api.put(`${API}/subproducts/${id}/recipe`, {
    headers: authHeaders(dueno),
    data: {
      edges: [{ childType: 'ingredient', childId: ingredientId, quantityNeta: RECIPE_QTY_G }],
    },
  });
  expect(recipeRes.ok(), `receta del subproducto → ${recipeRes.status()}`).toBeTruthy();
  return id;
}

async function getProductionStock(id: string): Promise<number> {
  const res = await api.get(`${API}/subproducts/production-status`, {
    headers: authHeaders(cocinero),
  });
  expect(res.ok()).toBeTruthy();
  const items = (await res.json()) as ProductionStatus[];
  const found = items.find((s) => s.id === id);
  expect(found, `subproducto ${SUB_NAME} no aparece en production-status`).toBeTruthy();
  return found!.currentStock;
}

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  dueno = await login(api, DUENO_EMAIL, 'admin');
  cocinero = await login(api, COCINERO_EMAIL, 'cocina');
  const ingredientId = await ensureIngredient();
  subproductId = await ensureSubproduct(ingredientId);
});

test.afterAll(async () => {
  await api.dispose();
});

test('smoke cocina: login por cookie → stock → registrar producción', async ({ page }) => {
  const stockBefore = await getProductionStock(subproductId);

  await test.step('login UI (cookie cocina_access)', async () => {
    await page.goto(`${COCINA_URL}/login`);
    await page.locator('#login-email').fill(COCINERO_EMAIL);
    await page.locator('#login-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar a cocina' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
  });

  await test.step('inventario carga el stock vía cookie (regresión guard)', async () => {
    // GET /kitchen/stock con cookie cocina_access — el camino que daba 401.
    await page.goto(`${COCINA_URL}/inventario`);
    await expect(page.getByText(ING_NAME)).toBeVisible({ timeout: 15_000 });
  });

  await test.step('registrar una tanda de producción', async () => {
    await page.goto(`${COCINA_URL}/produccion`);
    const row = page.locator('li', { hasText: SUB_NAME }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Producir' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Cantidad producida/).fill(String(PRODUCE_QTY));
    await dialog.getByRole('button', { name: 'Registrar' }).click();

    // Éxito: el modal muestra la confirmación y el consumo de la receta.
    await expect(dialog.getByText('Se descontó del inventario')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(ING_NAME)).toBeVisible();
    await dialog.getByRole('button', { name: 'Listo' }).click();
  });

  await test.step('verificación dura por API: el stock subió', async () => {
    const stockAfter = await getProductionStock(subproductId);
    expect(stockAfter).toBe(stockBefore + PRODUCE_QTY);
  });
});
