import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API, DUENO_EMAIL, PASSWORD, authHeaders, login, type Session } from './helpers';

/**
 * Un pago con VARIOS comprobantes, en la interfaz real.
 *
 * Lo que de verdad prueba esto —y no prueban los e2e de API— es que las
 * imágenes SE VEAN: la galería las pide por índice, y una ruta mal armada
 * devuelve un `<img>` roto que `toBeVisible()` da por bueno. Por eso se mide
 * `naturalWidth`, que solo es > 0 cuando el navegador decodificó los bytes.
 */

const PIN = '123456';
const fixture = (n: number) => path.join(__dirname, 'fixtures', `comprobante-${n}.png`);

/** Deja una factura CONFIRMED sin pagar y devuelve su id. */
async function facturaPorPagar(api: APIRequestContext, s: Session): Promise<string> {
  const stamp = Date.now();
  const H = { ...authHeaders(s), 'Content-Type': 'application/json' };
  const ing = await api.post(`${API}/ingredients`, {
    headers: H,
    data: {
      name: `Insumo comprobantes ${stamp}`,
      unitPurchase: 'kg',
      unitRecipe: 'g',
      conversionFactor: 1000,
      thresholdMin: 0,
    },
  });
  expect(ing.ok(), `crear insumo → ${ing.status()}`).toBeTruthy();
  const ingredientId = ((await ing.json()) as { id: string }).id;

  const cuerpo = {
    supplierNit: `900${stamp % 1_000_000}`,
    supplierName: `Proveedor comprobantes ${stamp}`,
    total: 200_000,
    items: [
      {
        entityType: 'INGREDIENT' as const,
        ingredientId,
        descriptionRaw: 'Insumo',
        quantity: 10,
        unit: 'kg',
        unitPrice: 20_000,
        total: 200_000,
      },
    ],
  };
  const draft = await api.post(`${API}/invoices/draft`, { headers: H, data: cuerpo });
  expect(draft.ok(), `borrador → ${draft.status()}`).toBeTruthy();
  const id = ((await draft.json()) as { id: string }).id;

  const conf = await api.post(`${API}/invoices/${id}/confirm`, { headers: H, data: cuerpo });
  expect(conf.ok(), `confirmar → ${conf.status()}`).toBeTruthy();
  return id;
}

async function entrarComoDueno(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/correo|email/i).fill(DUENO_EMAIL);
  await page.getByLabel(/contraseña/i).fill(PASSWORD);
  await page.getByRole('button', { name: /entrar|ingresar|iniciar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}

/** Las miniaturas de la galería, ya decodificadas por el navegador. */
async function anchosDeLasImagenes(page: Page): Promise<number[]> {
  const imgs = page.getByRole('img', { name: /^Comprobante \d+$/ });
  await expect
    .poll(async () => {
      const n = await imgs.count();
      if (n === 0) return -1;
      return Math.min(...(await imgs.evaluateAll((els) =>
        (els as HTMLImageElement[]).map((e) => e.naturalWidth),
      )));
    }, { timeout: 10_000 })
    .toBeGreaterThan(0);
  return imgs.evaluateAll((els) => (els as HTMLImageElement[]).map((e) => e.naturalWidth));
}

test.describe('Comprobantes múltiples por pago', () => {
  test('una factura se paga con dos comprobantes, se agrega un tercero y se quita uno', async ({
    page,
    request,
  }) => {
    const dueno = await login(request, DUENO_EMAIL);
    const invoiceId = await facturaPorPagar(request, dueno);

    await entrarComoDueno(page);
    await page.goto(`/invoices/${invoiceId}`);

    // --- Marcar pagada con DOS comprobantes de una sola vez ---
    await page.getByRole('button', { name: /marcar pagada/i }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.locator('input[type="file"]').setInputFiles([fixture(1), fixture(2)]);
    // El campo rotula cuántas van: si el multiple no funcionó, esto falla acá.
    await expect(modal.getByText(/Comprobante \(foto de transferencia\/recibo\) \(2\)/)).toBeVisible();
    await modal.locator('input[inputmode="numeric"], input[type="password"]').first().fill(PIN);
    await modal.getByRole('button', { name: /confirmar con pin/i }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    // --- Verlos: dos miniaturas, las dos decodificadas ---
    await page.getByRole('button', { name: /ver comprobante/i }).first().click();
    const galeria = page.getByRole('dialog');
    await expect(galeria).toBeVisible();
    await expect(galeria.getByRole('heading', { name: /Comprobantes de pago \(2\)/ })).toBeVisible();
    expect(await anchosDeLasImagenes(galeria as unknown as Page)).toHaveLength(2);

    // --- Agregar un tercero sin salir del diálogo ---
    await galeria.locator('input[type="file"]').setInputFiles([fixture(3)]);
    await expect(galeria.getByRole('heading', { name: /Comprobantes de pago \(3\)/ })).toBeVisible({
      timeout: 20_000,
    });
    expect(await anchosDeLasImagenes(galeria as unknown as Page)).toHaveLength(3);

    // --- Quitar uno: quedan dos y las dos siguen cargando ---
    await galeria.getByRole('button', { name: /Quitar el comprobante 1/ }).click();
    await expect(galeria.getByRole('heading', { name: /Comprobantes de pago \(2\)/ })).toBeVisible({
      timeout: 20_000,
    });
    const anchos = await anchosDeLasImagenes(galeria as unknown as Page);
    expect(anchos).toHaveLength(2);
    expect(Math.min(...anchos)).toBeGreaterThan(0);

    // --- El server coincide con la pantalla (no es solo estado local) ---
    const res = await request.get(`${API}/invoices/${invoiceId}`, {
      headers: authHeaders(dueno),
    });
    const inv = (await res.json()) as { hasPaymentProof: boolean; paymentProofsCount: number };
    expect(inv.hasPaymentProof).toBe(true);
    expect(inv.paymentProofsCount).toBe(2);
  });

  test('una factura pagada nunca se queda sin comprobante', async ({ page, request }) => {
    const dueno = await login(request, DUENO_EMAIL);
    const invoiceId = await facturaPorPagar(request, dueno);

    // Pagada con UNO solo, por API (el camino de UI ya está cubierto arriba).
    const paid = await request.post(`${API}/invoices/${invoiceId}/payment/paid`, {
      headers: { ...authHeaders(dueno), 'X-Approval-Pin': PIN },
      multipart: {
        proof: { name: 'p.png', mimeType: 'image/png', buffer: await readFixture(1) },
        bankAmount: '200000',
        cashAmount: '0',
      },
    });
    expect(paid.ok(), `pagar → ${paid.status()} ${await paid.text()}`).toBeTruthy();

    await entrarComoDueno(page);
    await page.goto(`/invoices/${invoiceId}`);
    await page.getByRole('button', { name: /ver comprobante/i }).first().click();
    const galeria = page.getByRole('dialog');
    await expect(galeria).toBeVisible();

    // Con un solo comprobante NO se ofrece quitarlo: el aviso lo explica.
    await expect(galeria.getByRole('button', { name: /Quitar el comprobante/ })).toHaveCount(0);
    await expect(galeria.getByText(/necesita al menos un comprobante/i)).toBeVisible();
  });
});

async function readFixture(n: number): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises');
  return readFile(fixture(n));
}

test.describe('Costos y gastos con varios comprobantes', () => {
  test('un costo fijo se paga con dos comprobantes y se ven desde Pagos', async ({
    page,
    request,
  }) => {
    const dueno = await login(request, DUENO_EMAIL);
    const H = { ...authHeaders(dueno), 'Content-Type': 'application/json' };
    const nombre = `Arriendo prueba ${Date.now()}`;
    // Arranca este mes: sin fecha de inicio el panel genera 24 períodos vencidos
    // y el test tendría que adivinar cuál pagar.
    const hoy = new Date();
    const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    const creado = await request.post(`${API}/fixed-costs`, {
      headers: H,
      data: {
        name: nombre,
        amount: 500_000,
        frequency: 'MONTHLY',
        category: 'Local',
        startedAt: desde,
      },
    });
    expect(creado.ok(), `crear costo fijo → ${creado.status()}`).toBeTruthy();

    await entrarComoDueno(page);
    await page.goto('/finanzas/costos-fijos');

    // Los períodos por pagar viven en su propio panel, agrupados por costo. El
    // segundo filtro descarta los div de puro texto y deja el grupo real.
    const grupo = page
      .locator('div')
      .filter({ hasText: new RegExp(nombre) })
      .filter({ has: page.getByRole('button', { name: /^Pagar$/ }) })
      .last();
    await expect(grupo).toBeVisible({ timeout: 15_000 });
    await grupo.getByRole('button', { name: /^Pagar$/ }).first().click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.locator('input[type="file"]').setInputFiles([fixture(1), fixture(2)]);
    await expect(modal.getByText(/Comprobante \(2\)/)).toBeVisible();
    await modal.getByRole('button', { name: /confirmar pago/i }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    // Y se ven desde el cockpit de Pagos, que es donde el dueño los busca.
    await page.goto('/finanzas/pagos');
    const boton = page
      .getByRole('button', { name: new RegExp(`Ver los comprobantes de ${nombre}`) })
      .first();
    await expect(boton).toBeVisible({ timeout: 20_000 });
    await expect(boton).toHaveText(/2/);
    await boton.click();

    const galeria = page.getByRole('dialog');
    await expect(galeria).toBeVisible();
    expect(await anchosDeLasImagenes(galeria as unknown as Page)).toHaveLength(2);
  });

  test('un compromiso se paga con dos comprobantes y admite un tercero después', async ({
    page,
    request,
  }) => {
    const dueno = await login(request, DUENO_EMAIL);
    const H = { ...authHeaders(dueno), 'Content-Type': 'application/json' };
    const descripcion = `Arreglo nevera ${Date.now()}`;
    const creado = await request.post(`${API}/payables`, {
      headers: H,
      data: { beneficiary: 'Cristian', description: descripcion, amount: 80_000 },
    });
    expect(creado.ok(), `crear compromiso → ${creado.status()}`).toBeTruthy();

    await entrarComoDueno(page);
    await page.goto('/finanzas/compromisos');

    const fila = page.locator('li', { hasText: descripcion }).first();
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await fila.getByRole('button', { name: /^Pagar$/ }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.locator('input[type="file"]').setInputFiles([fixture(1), fixture(2)]);
    await expect(modal.getByText(/Comprobante \(opcional\) \(2\)/)).toBeVisible();
    await modal.getByRole('button', { name: /^Pagar/ }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    const pagada = page.locator('li', { hasText: descripcion }).first();
    const verlos = pagada.getByRole('button', { name: /2 comprobantes/ });
    await expect(verlos).toBeVisible({ timeout: 20_000 });
    await verlos.click();

    const galeria = page.getByRole('dialog');
    await expect(galeria).toBeVisible();
    expect(await anchosDeLasImagenes(galeria as unknown as Page)).toHaveLength(2);

    // Acá el comprobante es OPCIONAL, así que sí se puede quitar hasta el último.
    await galeria.locator('input[type="file"]').setInputFiles([fixture(3)]);
    await expect(
      galeria.getByRole('heading', { name: /Comprobantes del compromiso \(3\)/ }),
    ).toBeVisible({ timeout: 20_000 });
    expect(await anchosDeLasImagenes(galeria as unknown as Page)).toHaveLength(3);
  });
});

test.describe('Nómina con varios comprobantes', () => {
  test('un abono de la semana se paga con dos comprobantes y se ven en la semana', async ({
    page,
    request,
  }) => {
    const dueno = await login(request, DUENO_EMAIL);
    const semana = await request.get(`${API}/workers/weekly`, { headers: authHeaders(dueno) });
    expect(semana.ok(), `semana → ${semana.status()}`).toBeTruthy();
    const data = (await semana.json()) as {
      weekStart: string;
      entries: Array<{ userId: string; fullName: string; days: Array<{ date: string }>; remaining: number }>;
    };
    const empleado = data.entries.find((e) => e.remaining > 0);
    test.skip(!empleado, 'no hay nadie con nómina configurada en esta base');

    await entrarComoDueno(page);
    await page.goto('/workers/semana');

    const tarjeta = page.locator('section, article, div').filter({
      hasText: new RegExp(empleado!.fullName),
    });
    await expect(tarjeta.first()).toBeVisible({ timeout: 15_000 });

    // El abono se registra por API (el flujo de días ya lo cubre otra suite);
    // lo que se valida acá es la GALERÍA de comprobantes en la pantalla.
    const abono = await request.post(`${API}/workers/weekly/pay`, {
      headers: authHeaders(dueno),
      multipart: {
        payload: JSON.stringify({
          userId: empleado!.userId,
          weekStart: data.weekStart,
          days: [empleado!.days[0]!.date],
          cashAmount: 0,
          bankAmount: 60_000,
        }),
        proof: { name: 'a.png', mimeType: 'image/png', buffer: await readFixture(1) },
      },
    });
    expect(abono.ok(), `abonar → ${abono.status()} ${await abono.text()}`).toBeTruthy();

    await page.goto('/workers/semana');
    const ver = page.getByRole('button', { name: /ver comprobante/i }).first();
    await expect(ver).toBeVisible({ timeout: 20_000 });
    await ver.click();

    const galeria = page.getByRole('dialog');
    await expect(galeria).toBeVisible();
    expect(await anchosDeLasImagenes(galeria as unknown as Page)).toHaveLength(1);

    // Un abono admite comprobantes de más: se suma un segundo desde la galería.
    await galeria.locator('input[type="file"]').setInputFiles([fixture(2)]);
    await expect(
      galeria.getByRole('heading', { name: /Comprobantes del abono \(2\)/ }),
    ).toBeVisible({ timeout: 20_000 });
    expect(await anchosDeLasImagenes(galeria as unknown as Page)).toHaveLength(2);

    // Y acá el comprobante es OPCIONAL: se puede quitar hasta el último.
    await galeria.getByRole('button', { name: /Quitar el comprobante 1/ }).click();
    await expect(
      galeria.getByRole('heading', { name: /^Comprobantes del abono$/ }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
