import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El service worker de avisos es un archivo suelto en `public/`: ningún bundler
 * lo compila y ningún test lo tocaba. Un error de tipeo ahí no rompe nada
 * visible — simplemente el aviso nunca aparece, que es el peor modo de fallar
 * para algo cuyo único trabajo es aparecer.
 *
 * Se evalúa el archivo REAL contra un `self` de mentira y se disparan los
 * eventos como los dispara el navegador.
 */
const CODIGO = readFileSync(
  join(__dirname, '../../../../public/sw-avisos.js'),
  'utf8',
);

interface Oyentes {
  push?: (e: unknown) => void;
  notificationclick?: (e: unknown) => void;
  install?: (e: unknown) => void;
  activate?: (e: unknown) => void;
}

function cargarWorker() {
  const oyentes: Oyentes = {};
  const showNotification = vi.fn();
  const openWindow = vi.fn();
  const matchAll = vi.fn().mockResolvedValue([]);
  const self = {
    addEventListener: (nombre: keyof Oyentes, fn: (e: unknown) => void) => {
      oyentes[nombre] = fn;
    },
    registration: { showNotification },
    clients: { matchAll, openWindow, claim: vi.fn() },
    location: { origin: 'https://admin.tercos.co' },
    skipWaiting: vi.fn(),
  };
  new Function('self', CODIGO)(self);
  return { oyentes, showNotification, openWindow, matchAll };
}

/** Un evento de push como lo entrega el navegador. */
function eventoPush(datos: unknown | null, esperas: Promise<unknown>[] = []) {
  return {
    data: datos === null ? null : { json: () => datos },
    waitUntil: (p: Promise<unknown>) => esperas.push(p),
  };
}

describe('service worker de avisos', () => {
  let w: ReturnType<typeof cargarWorker>;

  beforeEach(() => {
    w = cargarWorker();
  });

  it('muestra el aviso con lo que mandó el servidor', () => {
    w.oyentes.push?.(
      eventoPush({
        title: 'Tercos · Stock bajo',
        body: 'Pan: 21 de 30 unidad',
        url: '/purchase-lists',
        tag: 'low_stock',
      }),
    );
    expect(w.showNotification).toHaveBeenCalledWith(
      'Tercos · Stock bajo',
      expect.objectContaining({
        body: 'Pan: 21 de 30 unidad',
        tag: 'low_stock',
        renotify: true,
        data: { url: '/purchase-lists' },
      }),
    );
  });

  it('un push sin datos NO muestra un aviso vacío', () => {
    // Un aviso que dice "Notificación" y nada más solo enseña que algo se rompió.
    w.oyentes.push?.(eventoPush(null));
    expect(w.showNotification).not.toHaveBeenCalled();
  });

  it('un push con basura tampoco tumba el worker', () => {
    const roto = {
      data: {
        json: () => {
          throw new SyntaxError('no es JSON');
        },
      },
      waitUntil: vi.fn(),
    };
    expect(() => w.oyentes.push?.(roto)).not.toThrow();
    expect(w.showNotification).not.toHaveBeenCalled();
  });

  it('tocar el aviso reusa la pestaña abierta en vez de abrir otra', async () => {
    const cliente = {
      url: 'https://admin.tercos.co/finanzas/estado',
      focus: vi.fn(),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    w.matchAll.mockResolvedValue([cliente]);
    const esperas: Promise<unknown>[] = [];
    w.oyentes.notificationclick?.({
      notification: { close: vi.fn(), data: { url: '/shifts' } },
      waitUntil: (p: Promise<unknown>) => esperas.push(p),
    });
    await Promise.all(esperas);

    expect(cliente.focus).toHaveBeenCalled();
    expect(cliente.navigate).toHaveBeenCalledWith('/shifts');
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it('sin pestañas abiertas abre una nueva en la pantalla del aviso', async () => {
    const esperas: Promise<unknown>[] = [];
    w.oyentes.notificationclick?.({
      notification: { close: vi.fn(), data: { url: '/purchase-lists' } },
      waitUntil: (p: Promise<unknown>) => esperas.push(p),
    });
    await Promise.all(esperas);
    expect(w.openWindow).toHaveBeenCalledWith('/purchase-lists');
  });

  it('una pestaña de otro origen no cuenta como propia', async () => {
    w.matchAll.mockResolvedValue([
      { url: 'https://tercos.co/menu', focus: vi.fn(), navigate: vi.fn() },
    ]);
    const esperas: Promise<unknown>[] = [];
    w.oyentes.notificationclick?.({
      notification: { close: vi.fn(), data: { url: '/shifts' } },
      waitUntil: (p: Promise<unknown>) => esperas.push(p),
    });
    await Promise.all(esperas);
    expect(w.openWindow).toHaveBeenCalledWith('/shifts');
  });
});
