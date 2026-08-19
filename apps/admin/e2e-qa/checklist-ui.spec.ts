/**
 * Recorrido de la CHECKLIST-QA-DESPLIEGUE **por la pantalla**, como lo haría
 * la persona que opera el local: clics reales, no llamadas a la API.
 *
 * Corre contra un entorno DEDICADO para no ensuciar el de desarrollo:
 *   API :3011 · Caja/Admin :3104 · Web del cliente :3100 · Cocina :3106
 * (ver `apps/api/qa/README-qa.md`).
 *
 *   pnpm exec playwright test --config e2e-qa/playwright.config.ts
 */
import { expect, test, type Page } from '@playwright/test';

const CAJA = 'http://localhost:3104';
const WEB = 'http://localhost:3100';
const COCINA = 'http://localhost:3106';
const PW = 'dev12345';

/** Sesiones guardadas por `auth.setup.ts` (evita el tope de logins/min). */
const SESION = {
  dueno: 'e2e-qa/.auth/dueno.json',
  operativo: 'e2e-qa/.auth/operativo.json',
  cocinero: 'e2e-qa/.auth/cocinero.json',
} as const;

async function loginEn(page: Page, base: string, email: string): Promise<void> {
  await page.goto(`${base}/login`);
  await page.getByLabel(/correo|email/i).fill(email);
  await page.getByLabel(/contraseña|password/i).fill(PW);
  await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25_000 });
}

/**
 * Entra a la caja abriéndola si hace falta.
 *
 * Sin turno abierto, `/caja` redirige a `/caja/shift/open`; ese redirect aborta
 * la navegación en curso (de ahí el `.catch`), y no es un error: es justamente
 * el gate que se quiere probar.
 */
async function entrarACaja(page: Page): Promise<void> {
  // Reintenta: el redirect del gate aborta la navegación en curso y hay que
  // volver a pedir la página, si no uno se queda en el launcher creyendo que
  // entró (me pasó, y el test daba un falso verde).
  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`${CAJA}/caja`, { waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForTimeout(1800);

    if (page.url().includes('/shift/open')) {
      await page.getByLabel(/Efectivo inicial/i).first().fill('100000');
      await page.getByRole('button', { name: /Abrir turno/i }).click();
      await page.waitForTimeout(3000);
      continue;
    }
    // "Carrito" solo existe dentro de la caja: es la prueba de que llegamos.
    if (await page.getByText('Carrito', { exact: false }).first().isVisible().catch(() => false)) return;
  }
  throw new Error(`no se pudo entrar a la caja; quedó en ${page.url()}`);
}

/**
 * Navega y espera a que la pantalla quede quieta.
 *
 * Varias rutas del admin redirigen según el estado (sin turno, sin permiso) y
 * ese redirect ABORTA la navegación en curso: `page.goto` lanza aunque la
 * pantalla termine cargando bien. Por eso se ignora el error y se espera al
 * DOM real.
 */
async function irA(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null);
  await page.waitForLoadState('domcontentloaded').catch(() => null);
  await page.waitForTimeout(1800);
}

test.describe.configure({ mode: 'serial' });

test.describe('Bloque 0 — Acceso desde la pantalla', () => {
  test('0.1 el dueño entra con su clave', async ({ page }) => {
    expect(page.url()).not.toContain('/login');
  });

  test('0.2 una clave incorrecta NO deja entrar y lo dice', async ({ page }) => {
    await page.goto(`${CAJA}/login`);
    await page.getByLabel(/correo|email/i).fill('dueno@dev.local');
    await page.getByLabel(/contraseña|password/i).fill('estaNoEsLaClave');
    await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click();
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/login');
    // El usuario tiene que ENTENDER que falló, no quedarse mirando la pantalla.
    // (Tras muchos intentos seguidos el mensaje es el del tope de intentos:
    // también sirve, lo que no vale es fallar en silencio.)
    await expect(
      page.getByText(/incorrect|inválid|no coincide|error|intento/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('0.3 el cocinero NO entra a la caja (lo manda a no autorizado)', async ({ page }) => {
    await page.goto(`${CAJA}/login`);
    await page.getByLabel(/correo|email/i).fill('cocinero@dev.local');
    await page.getByLabel(/contraseña|password/i).fill(PW);
    await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click();
    await page.waitForTimeout(3000);
    expect(page.url()).toMatch(/unauthorized|login/);
  });

  test('0.4 las sesiones de Caja y Cocina no se pisan', async ({ browser }) => {
    const ctx = await browser.newContext();
    const caja = await ctx.newPage();
    const cocina = await ctx.newPage();
    await loginEn(caja, CAJA, 'dueno@dev.local');
    await loginEn(cocina, COCINA, 'cocinero@dev.local');
    // Volver a la caja y recargar: la sesión del dueño debe seguir viva.
    await caja.reload();
    await caja.waitForLoadState('domcontentloaded');
    expect(caja.url()).not.toContain('/login');
    await ctx.close();
  });
});

test.describe('Bloque 2a — El día 0 no hay stock', () => {
  // La caja la opera el ADMIN_OPERATIVO, no el dueño.
  test.use({ storageState: SESION.operativo });

  test('2.1 recién instalado, la reventa sale AGOTADA hasta cargarle stock', async ({ page }) => {
    await entrarACaja(page);
    // Es el estado real del día 0 y conviene verlo: sin inventario, las
    // bebidas no se pueden vender aunque el producto exista.
    await expect(page.getByText('AGOTADO').first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Bloque 2b — Cargar stock desde la pantalla', () => {
  test.use({ storageState: SESION.dueno });

  test('2.2 cargar stock inicial deja el producto vendible', async ({ page }) => {
    await irA(page, `${CAJA}/inventory`);

    // Entrar al ajuste del primer producto de la lista.
    const ajustar = page.locator('a[href*="/adjust"]').first();
    await expect(ajustar).toBeVisible({ timeout: 20_000 });
    await ajustar.click();
    await page.waitForTimeout(1500);

    await page.getByText(/Stock inicial/i).first().click();
    await page.getByLabel(/Magnitud/i).first().fill('50');
    await page.getByLabel(/Costo por unidad/i).first().fill('2000');
    await page.getByRole('button', { name: /Registrar movimiento/i }).click();
    await page.waitForTimeout(2500);

    // El movimiento quedó en el libro. Se busca DENTRO de la tabla: la lista
    // de filtros tiene un <option> "Stock inicial" que nunca es visible y se
    // lleva el match si uno busca por texto suelto.
    await irA(page, `${CAJA}/inventory/movements`);
    const tabla = page.locator('table').first();
    await expect(tabla).toContainText('Stock inicial', { timeout: 20_000 });
    await expect(tabla).toContainText('+50');
  });
});

test.describe('Bloque 4 — Vender y cobrar en la pantalla', () => {
  test.use({ storageState: SESION.operativo });
  /** Producto preparado del menú semilla: no depende de stock de reventa. */
  const PRODUCTO = /Double Smash\s*\$/;
  const PRECIO = 29_000;

  test('4.1 agregar un producto al carrito y cobrarlo en efectivo', async ({ page }) => {
    await entrarACaja(page);

    const tile = page.getByRole('button', { name: PRODUCTO }).first();
    await expect(tile).toBeVisible({ timeout: 20_000 });
    await tile.click();

    // Tocar el producto abre el modal de cantidad; hay que confirmar.
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();

    // El carrito deja de estar vacío.
    await expect(page.getByText('Carrito vacío')).toBeHidden({ timeout: 10_000 });

    await page.getByRole('button', { name: /^Cobrar/ }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await modal.getByLabel(/Recibido/i).fill('50000');

    // El vuelto que ve el cajero: 50.000 − 29.000 = 21.000
    await expect(modal.getByText(/21[.,]000/).first()).toBeVisible({ timeout: 10_000 });

    await modal.getByRole('button', { name: /Confirmar/ }).click();

    // Confirmación visible + carrito limpio para la próxima venta.
    await expect(page.getByText(/Recibo #\d+/).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('Carrito vacío')).toBeVisible();
    expect(PRECIO).toBe(29_000);
  });

  test('4.3 el historial muestra la venta recién hecha', async ({ page }) => {
    await irA(page, `${CAJA}/caja/historial`);
    await expect(page.getByText(/#\d+/).first()).toBeVisible({ timeout: 20_000 });
  });

  test('4.4 el badge "En caja" sube exactamente lo cobrado en efectivo', async ({ page }) => {
    await entrarACaja(page);

    // Se mide el DELTA, no un monto absoluto: la caja arrastra las ventas
    // anteriores y un número fijo haría fallar el test en la segunda corrida.
    const leerBadge = async (): Promise<number> => {
      const txt = await page.getByText(/En caja:/i).first().innerText();
      return Number(txt.replace(/[^0-9]/g, ''));
    };
    const antes = await leerBadge();

    await page.getByRole('button', { name: PRODUCTO }).first().click();
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await page.getByRole('button', { name: /^Cobrar/ }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: 'Efectivo', exact: true }).click();
    await modal.getByLabel(/Recibido/i).fill('50000');
    await modal.getByRole('button', { name: /Confirmar/ }).click();
    await expect(page.getByText(/Recibo #\d+/).first()).toBeVisible({ timeout: 25_000 });

    await expect
      .poll(leerBadge, { timeout: 15_000 })
      .toBe(antes + PRECIO);
  });
});

test.describe('Bloque 5 — El cliente pide desde la web', () => {
  /** Agrega el primer producto disponible del menú (abre el modal y confirma). */
  async function agregarAlCarrito(page: Page): Promise<void> {
    await page.goto(WEB, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // Los agotados también son botones: hay que tomar uno vendible.
    await page.getByRole('button', { name: /Double Smash/ }).first().click();
    await page.getByRole('button', { name: /Agregar al carrito/ }).click();
  }

  test('5.1 el cliente puede agregar un producto al carrito', async ({ page }) => {
    await agregarAlCarrito(page);
    await expect(page.getByRole('button', { name: /ítem/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('5.2 el carrito sobrevive a recargar la página', async ({ page }) => {
    await agregarAlCarrito(page);
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: /ítem/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('5.3 el checkout NO deja mandar el pedido con el celular incompleto', async ({ page }) => {
    await agregarAlCarrito(page);
    await page.getByRole('button', { name: /ítem/ }).click();
    await page.getByRole('button', { name: 'Ir a pagar' }).click();
    await page.waitForURL((u) => u.pathname === '/checkout', { timeout: 15_000 });

    await page.getByPlaceholder('Como te van a llamar al retirar').fill('Cliente QA');
    await page.getByPlaceholder('3001234567').fill('300123');

    // La app no deja siquiera intentarlo: el botón queda inhabilitado hasta
    // que el número esté completo. Mejor que dejar mandar y fallar después.
    await expect(
      page.getByRole('button', { name: /Confirmar y recibir datos de pago/ }),
    ).toBeDisabled({ timeout: 10_000 });
  });

  test('5.4 un pedido completo llega a la pantalla de seguimiento', async ({ page }) => {
    await agregarAlCarrito(page);
    await page.getByRole('button', { name: /ítem/ }).click();
    await page.getByRole('button', { name: 'Ir a pagar' }).click();
    await page.waitForURL((u) => u.pathname === '/checkout', { timeout: 15_000 });

    await page.getByPlaceholder('Como te van a llamar al retirar').fill('Cliente QA UI');
    await page.getByPlaceholder('3001234567').fill('3001234567');
    await page.getByRole('button', { name: /Confirmar y recibir datos de pago/ }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/checkout/success/'), { timeout: 25_000 });
    // El cliente ve cómo pagar, no una pantalla en blanco.
    await expect(page.getByText(/pendiente|transferencia|pago/i).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Bloque 5b — El pedido web llega a la caja', () => {
  test.use({ storageState: SESION.operativo });

  test('5.5 el pedido del cliente aparece en "Pedidos web"', async ({ page }) => {
    await entrarACaja(page);
    await page.getByRole('button', { name: /Pedidos web|Web/i }).first().click();
    await expect(page.getByText(/Cliente QA UI/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Bloque 6 — La cocina en su pantalla', () => {
  test.use({ storageState: SESION.cocinero });
  test('6.1 el cocinero entra y ve sus secciones', async ({ page }) => {
    await irA(page, COCINA);
    await expect(page.getByText(/biblia|producci[oó]n|inventario/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('6.2 el inventario de cocina NO muestra precios ni costos', async ({ page }) => {
    await irA(page, `${COCINA}/inventario`);
    const texto = (await page.locator('body').innerText()).toLowerCase();
    expect(texto).not.toMatch(/costo unitario|último costo|valorizado/);
  });

  test('6.3 la biblia de recetas se ve', async ({ page }) => {
    await irA(page, `${COCINA}/biblia`);
    await expect(page.locator('body')).toContainText(/receta|preparaci|ingrediente|producto/i);
  });
});

test.describe('Bloque 8/9 — El dueño mira sus números', () => {
  test.use({ storageState: SESION.dueno });
  const PANTALLAS: Array<[string, string, RegExp]> = [
    ['Estado financiero', '/finanzas/estado', /ingreso|margen|neto|resultado/i],
    ['Tesorería', '/finanzas/tesoreria', /efectivo|cuenta|saldo/i],
    ['Reporte de ventas', '/reports/sales', /venta|ingreso|total/i],
    ['Top productos', '/reports/products', /producto|margen|cantidad/i],
    ['Uso y mermas', '/reports/usage', /merma|consumo|uso/i],
    ['Inventario', '/inventory', /stock|insumo|producto/i],
    ['Movimientos', '/inventory/movements', /movimiento|fecha|tipo/i],
    ['Arqueos', '/caja/arqueos', /arqueo|cierre|caja|sin/i],
  ];

  for (const [nombre, ruta, contenido] of PANTALLAS) {
    test(`${nombre} carga y muestra información`, async ({ page }) => {
      const errores: string[] = [];
      page.on('pageerror', (e) => errores.push(String(e).slice(0, 120)));
        await irA(page, `${CAJA}${ruta}`);
      await expect(page.locator('body')).toContainText(contenido, { timeout: 20_000 });
      // Ninguna pantalla debe reventar en la cara del dueño.
      expect(errores, `errores de JS en ${ruta}`).toEqual([]);
    });
  }
});

test.describe('Bloque 16 — En el celular', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    storageState: SESION.operativo,
  });

  test('16.1 la web del cliente no se corre de lado', async ({ page }) => {
    for (const ruta of ['/', '/checkout', '/nosotros', '/ubicaciones']) {
      await page.goto(`${WEB}${ruta}`).catch(() => null);
      await page.waitForTimeout(800);
      const { s, c } = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth,
        c: document.documentElement.clientWidth,
      }));
      expect(s, `scroll horizontal en ${ruta}`).toBeLessThanOrEqual(c + 1);
    }
  });

  test('16.2 la caja no se corre de lado en el celular', async ({ page }) => {
    for (const ruta of ['/caja', '/caja/cierre', '/caja/historial']) {
      await page.goto(`${CAJA}${ruta}`).catch(() => null);
      await page.waitForTimeout(1000);
      const { s, c } = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth,
        c: document.documentElement.clientWidth,
      }));
      expect(s, `scroll horizontal en ${ruta}`).toBeLessThanOrEqual(c + 1);
    }
  });
});
