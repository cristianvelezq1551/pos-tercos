import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import {
  API,
  DUENO_EMAIL,
  ensureOpenShiftToday,
  login,
  loginAndEnterCaja,
  OPERATIVO_EMAIL,
  WEB_URL,
  type Session,
} from './helpers';

/**
 * Elegir la bebida de un combo DESDE LA CAJA.
 *
 * Los e2e de la API ya prueban que el inventario descuente lo elegido; lo que
 * solo se ve abriendo la app es que el selector aparezca, que no deje agregar
 * sin elegir, que el recargo se sume en pantalla y que la fila del carrito diga
 * qué bebida lleva. Un cambio puede pasar typecheck, lint y 900 tests y estar
 * roto acá — pasó varias veces en este repo (§7.v54).
 */

const SUF = Date.now();
const COMBO = `Combo Navegador ${SUF}`;

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

let api: APIRequestContext;
let dueno: Session;
let pepsi: { id: string };
let coca: { id: string };
let jugo: { id: string };
let smash: { id: string };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  dueno = await login(api, DUENO_EMAIL);
  const operativo = await login(api, OPERATIVO_EMAIL);
  await ensureOpenShiftToday(api, operativo, dueno);

  const bebida = (name: string, basePrice: number) => ({
    name,
    basePrice,
    category: 'Bebidas',
    directResale: true,
    unitPurchase: 'caja',
    unitStock: 'unidad',
    conversionFactor: 24,
  });
  pepsi = await crear(api, dueno, '/products', bebida(`Pepsi Nav ${SUF}`, 5000));
  coca = await crear(api, dueno, '/products', bebida(`Coca Nav ${SUF}`, 5000));
  jugo = await crear(api, dueno, '/products', bebida(`Jugo Nav ${SUF}`, 8000));
  smash = await crear(api, dueno, '/products', {
    name: `Smash Nav ${SUF}`,
    basePrice: 22000,
    category: 'Burgers',
  });
  for (const b of [pepsi, coca, jugo]) {
    await crear(api, dueno, '/inventory/movements', {
      type: 'INITIAL',
      entityType: 'PRODUCT',
      productId: b.id,
      delta: 48,
      unitCost: 1500,
    });
  }
  await crear(api, dueno, '/products', {
    name: COMBO,
    basePrice: 60000,
    category: 'Combos',
    isCombo: true,
    comboPrice: 60000,
    comboComponents: [{ productId: smash.id, quantity: 2 }],
    choiceGroups: [
      {
        label: 'Bebida',
        quantity: 2,
        options: [
          { productId: pepsi.id },
          { productId: coca.id },
          { productId: jugo.id, priceDelta: 3000 },
        ],
      },
    ],
  });
});

test.afterAll(async () => {
  await api.dispose();
});

test('el cajero elige la bebida del combo, cobra y el inventario sigue la elección', async ({
  page,
  request,
}) => {
  await loginAndEnterCaja(page, OPERATIVO_EMAIL);

  // Buscar el combo en el catálogo y abrirlo.
  await page.getByRole('button', { name: 'Buscar producto' }).click();
  await page.getByPlaceholder(/buscar/i).first().fill(`Navegador ${SUF}`);
  await page.getByRole('button', { name: new RegExp(COMBO) }).first().click();

  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();

  // Dos bebidas ⇒ dos selectores, y NADA viene marcado.
  await expect(dialogo.getByText('Bebida 1')).toBeVisible();
  await expect(dialogo.getByText('Bebida 2')).toBeVisible();
  const agregar = dialogo.getByRole('button', { name: /agregar al carrito/i });
  await expect(agregar).toBeDisabled();

  // Elegir una de cada una: el total sigue en $60.000 (sin recargo).
  await dialogo.getByRole('radio', { name: new RegExp(`Coca Nav ${SUF}`) }).first().check();
  await expect(agregar).toBeDisabled(); // falta la segunda
  await dialogo.getByRole('radio', { name: new RegExp(`Pepsi Nav ${SUF}`) }).nth(1).check();
  await expect(agregar).toBeEnabled();
  await expect(dialogo.getByText('$ 60.000', { exact: false }).first()).toBeVisible();

  // El jugo suma su recargo POR UNIDAD: cambiar la segunda a jugo → $63.000.
  await dialogo.getByRole('radio', { name: new RegExp(`Jugo Nav ${SUF}`) }).nth(1).check();
  await expect(dialogo.getByText('$ 63.000', { exact: false }).first()).toBeVisible();

  await agregar.click();
  await expect(dialogo).toBeHidden();

  // La fila del carrito dice qué bebidas lleva.
  const carrito = page.getByText(/Bebida:/).first();
  await expect(carrito).toBeVisible();
  await expect(carrito).toContainText(`Coca Nav ${SUF}`);
  await expect(carrito).toContainText(`Jugo Nav ${SUF}`);

  // Cobrar de verdad: es lo único que prueba que la elección viaja de la
  // pantalla al inventario. Los e2e de la API arman el payload a mano.
  await page.getByRole('button', { name: /^Cobrar/ }).click();
  const cobro = page.getByRole('dialog');
  await expect(cobro).toBeVisible();
  await cobro.getByRole('button', { name: 'Efectivo', exact: true }).click();
  await cobro.getByLabel('Recibido').fill('100000');
  await cobro.getByRole('button', { name: /Confirmar/ }).click();
  await expect(page.getByText(/Recibo #\d+/).first()).toBeVisible({ timeout: 20_000 });

  // El inventario descontó la Coca y el Jugo — y NO la Pepsi.
  const stock = async (productId: string): Promise<number> => {
    const res = await request.get(`${API}/inventory/stock/product/${productId}`, {
      headers: { Authorization: `Bearer ${dueno.token}`, 'X-Client-App': 'admin' },
    });
    expect(res.ok(), `stock → ${res.status()}`).toBeTruthy();
    return (await res.json()).currentStock as number;
  };
  expect(await stock(coca.id)).toBe(47);
  expect(await stock(jugo.id)).toBe(47);
  expect(await stock(pepsi.id)).toBe(48);
});

test('el cliente elige la bebida desde la web, en un teléfono', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });

  // El menú público se cachea 30 s en el API (staleness deliberada: lo pega
  // internet en cada visita). Un combo recién creado tarda hasta ese tiempo en
  // aparecer, así que se recarga hasta verlo en vez de fallar por el caché.
  const card = page.getByRole('button', { name: new RegExp(COMBO) }).first();
  await expect(async () => {
    await page.goto(WEB_URL);
    await expect(card).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });

  await card.click();

  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText('Bebida 1')).toBeVisible();
  await expect(dialogo.getByText('Bebida 2')).toBeVisible();

  // Sin elegir no se puede agregar: si el pedido llegara sin bebida, el local
  // no sabría qué preparar.
  const agregar = page.getByRole('button', { name: /Agregar al carrito/ });
  await expect(agregar).toBeDisabled();

  await dialogo.getByRole('radio', { name: new RegExp(`Coca Nav ${SUF}`) }).first().check();
  await dialogo.getByRole('radio', { name: new RegExp(`Jugo Nav ${SUF}`) }).nth(1).check();
  await expect(agregar).toBeEnabled();

  // El recargo del jugo se ve y se suma.
  await expect(dialogo.getByText('+$ 3.000').first()).toBeVisible();

  // Piso táctil de 44 px: en la cocina y en la caja ya es la regla, y acá el
  // dedo es el único apuntador que hay.
  const opcion = dialogo.getByRole('radio', { name: new RegExp(`Coca Nav ${SUF}`) }).first();
  const alto = await opcion.evaluate((el) => (el.closest('label') as HTMLElement).offsetHeight);
  expect(alto).toBeGreaterThanOrEqual(44);

  await agregar.click();
  await expect(dialogo).toBeHidden();

  // El carrito dice qué bebidas lleva.
  await page.getByRole('button', { name: /Ver pedido|carrito/i }).first().click();
  const linea = page.getByText(new RegExp(`Coca Nav ${SUF}`)).first();
  await expect(linea).toBeVisible();
});

test('el dueño crea un combo con bebida a elegir desde el formulario', async ({ page }) => {
  const nombre = `Combo Form ${SUF}`;

  await page.goto('/login');
  await page.locator('#login-email').fill(DUENO_EMAIL);
  await page.locator('#login-password').fill('dev12345');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20_000 });

  await page.goto('/products/new');
  await page.getByRole('button', { name: /Combo/ }).first().click();

  await page.getByLabel('Nombre').fill(nombre);
  await page.getByLabel(/Precio base/i).first().fill('60000');
  await page.getByLabel(/Precio del combo/i).fill('60000');
  // La categoría es obligatoria al crear: sin ella el producto solo aparece
  // bajo "Todo" en la caja y en la web.
  await page.locator('#category').selectOption('Combos');

  // Componente fijo del combo.
  await page.locator('select').filter({ hasText: 'Elegir producto' }).first()
    .selectOption(smash.id);

  // Grupo a elegir: es lo que este cambio agregó al formulario.
  await page.getByRole('button', { name: /Agregar grupo para elegir/ }).click();
  await page.getByLabel('Qué elige').fill('Bebida');
  await page.getByLabel('Cuántas').fill('2');
  const opciones = page.getByLabel('Opción', { exact: true });
  await opciones.nth(0).selectOption(coca.id);
  await opciones.nth(1).selectOption(jugo.id);
  await page.getByLabel('Recargo de la opción').nth(1).fill('3000');

  await page.getByRole('button', { name: /^Crear|Guardar/ }).click();
  await page.waitForURL((url) => url.pathname === '/products', { timeout: 20_000 });

  // Quedó guardado con su grupo (y no solo "sin error en pantalla").
  const res = await api.get(`${API}/products`, {
    headers: { Authorization: `Bearer ${dueno.token}`, 'X-Client-App': 'admin' },
  });
  const creado = ((await res.json()) as Array<{ name: string; choiceGroups?: unknown[] }>).find(
    (p) => p.name === nombre,
  );
  expect(creado, 'el combo no se creó').toBeTruthy();
  expect(creado!.choiceGroups).toHaveLength(1);
});
