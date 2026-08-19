// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BROLL_MENU } from '../lib/broll-menu';

/**
 * La TV del local corre sin operador: nadie va a ver un error en pantalla y
 * arreglarlo. La invariante es "el turnero NUNCA queda vacío". Mutantes que
 * estos tests matan:
 * - API caída → pantalla en negro delante de los clientes.
 * - el dueño borra todos los slides → pantalla en negro.
 * - respuesta con forma inesperada → crash del kiosko.
 */

const logError = vi.fn();
vi.mock('../../../lib/client-log', () => ({ logError: (...a: unknown[]) => logError(...a) }));

const { useBrollConfig } = await import('./useBrollConfig');

const slide = (name: string) => ({
  id: '88888888-8888-4888-8888-888888888888',
  imageUrl: `/uploads/${name}.jpg`,
  name,
  tag: 'Burgers',
  price: '$29K',
  description: 'Doble carne smash.',
  sortOrder: 0,
  isActive: true,
});

/** Respuesta OK del endpoint /api/display/broll (`asOf` es parte del contrato). */
const okResponse = (body: Record<string, unknown>) => ({
  ok: true,
  json: async () => ({ asOf: '2026-07-22T15:00:00.000Z', ...body }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useBrollConfig — contenido configurado por el dueño', () => {
  it('mapea los slides del admin al formato del carrusel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ slides: [slide('Doble Smash')], tracks: [] })),
    );
    const { result } = renderHook(() => useBrollConfig());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toEqual({
      img: '/uploads/Doble Smash.jpg',
      name: 'Doble Smash',
      tag: 'Burgers',
      price: '$29K',
      desc: 'Doble carne smash.',
    });
  });

  it('expone las pistas de música configuradas', async () => {
    const tracks = [
      {
        id: '99999999-9999-4999-8999-999999999999',
        label: 'Ambiente',
        audioUrl: '/display/track-audio/1',
        sortOrder: 0,
        isActive: true,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ slides: [slide('X')], tracks })),
    );
    const { result } = renderHook(() => useBrollConfig());
    await waitFor(() => expect(result.current.tracks).toHaveLength(1));
  });
});

describe('useBrollConfig — la pantalla nunca queda vacía', () => {
  it('arranca con el menú por defecto antes de que responda la API', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    const { result } = renderHook(() => useBrollConfig());
    expect(result.current.items).toBe(BROLL_MENU);
  });

  it('con la API caída se queda con el fallback y lo deja en el log', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { result } = renderHook(() => useBrollConfig());
    await waitFor(() => expect(logError).toHaveBeenCalled());
    expect(result.current.items).toBe(BROLL_MENU);
  });

  it('con respuesta no-OK conserva el fallback', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useBrollConfig());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(result.current.items).toBe(BROLL_MENU);
  });

  it('si el dueño borra TODOS los slides conserva el fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ slides: [], tracks: [] })));
    const { result } = renderHook(() => useBrollConfig());
    await waitFor(() => expect(result.current.items).toBe(BROLL_MENU));
  });

  it('una respuesta con forma inesperada no rompe el kiosko', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ cualquier: 'cosa' })));
    const { result } = renderHook(() => useBrollConfig());
    await waitFor(() => expect(result.current.items).toBe(BROLL_MENU));
  });
});

describe('useBrollConfig — refresco periódico', () => {
  it('re-consulta a los 5 minutos (el dueño edita sin reiniciar la TV)', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(okResponse({ slides: [slide('Doble')], tracks: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    renderHook(() => useBrollConfig());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('deja de consultar al desmontar (no filtra el intervalo)', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(okResponse({ slides: [slide('Doble')], tracks: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    const { unmount } = renderHook(() => useBrollConfig());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    unmount();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('pide sin caché (si no, el kiosko sirve slides viejos para siempre)', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(okResponse({ slides: [slide('Doble')], tracks: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    renderHook(() => useBrollConfig());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith('/api/display/broll', { cache: 'no-store' });
  });
});
