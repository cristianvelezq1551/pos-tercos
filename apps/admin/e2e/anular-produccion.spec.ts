import { expect, test, type APIRequestContext } from '@playwright/test';
import { API, DUENO_EMAIL, login, PASSWORD, type Session } from './helpers';

/**
 * Anular una tanda de producción DESDE LA PANTALLA.
 *
 * Los e2e de la API ya prueban que las cuentas dan; lo que solo se ve abriendo
 * la app es que el botón exista, que la vista previa cargue y que la tanda
 * quede marcada. Un cambio puede pasar typecheck, lint y 900 tests y estar roto
 * acá — pasó tres veces en este repo.
 */

const SUB_NOMBRE = `Salsa Navegador ${Date.now()}`;
const ING_NOMBRE = `Tomate Navegador ${Date.now()}`;

async function crear(
  api: APIRequestContext,
  s: Session,
  path: string,
  data: object,
): Promise<{ id: string }> {
  const res = await api.post(`${API}${path}`, {
    headers: { Authorization: `Bearer ${s.token}`, 'X-Client-App': 'admin' },
    data,
  });
  expect(res.ok(), `${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as { id: string };
}

test('el dueño anula una tanda desde el hub de cocina', async ({ page, request }) => {
  const s = await login(request, DUENO_EMAIL);
  const auth = { Authorization: `Bearer ${s.token}`, 'X-Client-App': 'admin' };

  // Catálogo propio: la tanda tiene que ser identificable entre las del día.
  const ing = await crear(request, s, '/ingredients', {
    name: ING_NOMBRE,
    unitPurchase: 'kg',
    unitRecipe: 'g',
    conversionFactor: 1000,
  });
  const sub = await crear(request, s, '/subproducts', {
    name: SUB_NOMBRE,
    yield: 10,
    unit: 'porción',
  });
  const receta = await request.put(`${API}/subproducts/${sub.id}/recipe`, {
    headers: auth,
    data: { edges: [{ childType: 'ingredient', childId: ing.id, quantityNeta: 500 }] },
  });
  expect(receta.ok()).toBeTruthy();
  await crear(request, s, '/inventory/movements', {
    type: 'INITIAL',
    entityType: 'INGREDIENT',
    ingredientId: ing.id,
    delta: 5000,
    unitCost: 3,
  });
  await crear(request, s, `/subproducts/${sub.id}/produce`, {
    quantityProduced: 10,
    idempotencyKey: crypto.randomUUID(),
  });

  // --- La pantalla ---
  await page.goto('/login');
  await page.locator('#login-email').fill(DUENO_EMAIL);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20_000 });

  await page.goto('/cocina?tab=produccion');
  const abrirDetalle = page.getByRole('button', {
    name: `Ver detalle de la tanda de ${SUB_NOMBRE}`,
  });
  await expect(abrirDetalle).toBeVisible({ timeout: 20_000 });
  await abrirDetalle.click();

  // El detalle ofrece anular.
  const abrirAnulacion = page.getByRole('button', { name: 'Anular tanda' });
  await expect(abrirAnulacion).toBeVisible();
  await abrirAnulacion.click();

  // La vista previa dice en cuánto queda cada ítem ANTES de decidir. Es lo que
  // hace que anular no se sienta inofensivo cuando no lo es. Se busca DENTRO
  // del diálogo: el nombre también está en la tabla de atrás.
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText('Cómo queda el inventario')).toBeVisible({ timeout: 20_000 });
  await expect(dialogo.getByText(ING_NOMBRE)).toBeVisible();
  await expect(dialogo.getByText(SUB_NOMBRE).first()).toBeVisible();

  const confirmar = dialogo.getByRole('button', { name: 'Anular tanda' });
  // Sin motivo no se puede anular: el rastro es obligatorio.
  await expect(confirmar).toBeDisabled();

  await dialogo.locator('#void-production-reason').fill('Se registró la tanda por error en la prueba');
  await expect(confirmar).toBeEnabled();
  await confirmar.click();

  // La tanda sigue en la lista, marcada: el registro existió y no desaparece.
  // Se busca la marca DENTRO de la fila de ESTA tanda — un "Anulada" suelto lo
  // podría estar poniendo cualquier otra fila de la tabla.
  const filaAnulada = page.getByRole('row', { name: new RegExp(SUB_NOMBRE) });
  await expect(filaAnulada.getByText('Anulada')).toBeVisible({ timeout: 20_000 });

  // Y el inventario se movió de verdad.
  const estado = await request.get(`${API}/subproducts/production-status`, { headers: auth });
  const enBodega = ((await estado.json()) as { id: string; currentStock: number }[]).find(
    (r) => r.id === sub.id,
  );
  expect(enBodega, `el subproducto ${sub.id} no está en production-status`).toBeDefined();
  expect(enBodega!.currentStock).toBe(0);
});
