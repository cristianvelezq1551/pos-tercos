import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { OPERATIVO_EMAIL, WEB_URL, escapeRegex, findSellableProduct, login, type Session } from './helpers';

/**
 * El modal de producto de la web (:3000) tiene que caber en la pantalla.
 *
 * Lo que se rompió: el diálogo no tenía tope de altura, así que el scroll lo
 * hacía el TELÓN y no el contenido — la cabecera (con la ✕, única salida en
 * teléfono) y el pie (con "Agregar al carrito") quedaban fuera de la vista.
 * El cliente veía un modal gigante sin forma de cerrarlo ni de agregar.
 *
 * `toBeInViewport()` es la aserción que importa: `toBeVisible()` pasaba igual
 * con el bug puesto, porque el botón EXISTÍA — solo que 800px más abajo.
 */

let api: APIRequestContext;
let operativo: Session;

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  operativo = await login(api, OPERATIVO_EMAIL);
});

test.afterAll(async () => {
  await api.dispose();
});

// Teléfono real y escritorio de poca altura: los dos tamaños donde el modal
// se desbordaba. El de 1366×700 es el monitor del local.
const PANTALLAS = [
  { nombre: 'teléfono', width: 390, height: 720 },
  { nombre: 'escritorio bajo', width: 1366, height: 700 },
];

for (const pantalla of PANTALLAS) {
  test(`el modal de producto cabe en pantalla y deja cerrar (${pantalla.nombre})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: pantalla.width, height: pantalla.height });

    const producto = await findSellableProduct(api, operativo);
    await page.goto(WEB_URL);
    const card = page.getByRole('button', { name: new RegExp(escapeRegex(producto.name)) }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();

    // Sin tocar el scroll: las dos acciones tienen que estar a la vista.
    await expect(dialogo.getByRole('button', { name: 'Cerrar' })).toBeInViewport();
    await expect(page.getByRole('button', { name: /Agregar al carrito/ })).toBeInViewport();

    // Y el diálogo no puede ser más alto que la ventana.
    const caja = await dialogo.boundingBox();
    expect(caja).not.toBeNull();
    expect(caja!.height).toBeLessThanOrEqual(pantalla.height);

    // La ✕ cierra de verdad (en teléfono es la única salida: no hay botón fuera
    // del diálogo al que llegar).
    await dialogo.getByRole('button', { name: 'Cerrar' }).click();
    await expect(dialogo).toBeHidden();
  });
}
