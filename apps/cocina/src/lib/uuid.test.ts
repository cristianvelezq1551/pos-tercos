import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from './uuid';

/**
 * La cocina se abre por IP de LAN (HTTP, contexto NO seguro) y ahí
 * `crypto.randomUUID` NO existe. Este fallback genera las idempotency-keys: si
 * produce IDs mal formados el backend los rechaza, y si repite valores dos
 * producciones distintas colapsan en una (tanda perdida).
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomUUID — con crypto.randomUUID disponible (HTTPS/localhost)', () => {
  it('delega en el nativo', () => {
    const native = vi.fn().mockReturnValue('11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('crypto', { randomUUID: native });
    expect(randomUUID()).toBe('11111111-1111-4111-8111-111111111111');
    expect(native).toHaveBeenCalled();
  });
});

describe('randomUUID — fallback con getRandomValues (HTTP por IP de LAN)', () => {
  it('produce un UUID v4 con formato válido', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(0xff) });
    expect(randomUUID()).toMatch(UUID_V4);
  });

  it('fija la versión 4 y el variant aunque el azar dé todo 0xff', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(0xff) });
    const id = randomUUID();
    expect(id[14]).toBe('4'); // nibble de versión
    expect('89ab').toContain(id[19]); // nibble de variant RFC 4122
  });

  it('fija versión y variant también con todo 0x00', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(0x00) });
    const id = randomUUID();
    expect(id).toMatch(UUID_V4);
    expect(id[14]).toBe('4');
    expect(id[19]).toBe('8');
  });

  it('usa el azar del crypto disponible (no inventa bytes)', () => {
    const spy = vi.fn((a: Uint8Array) => a.fill(0x42));
    vi.stubGlobal('crypto', { getRandomValues: spy });
    expect(randomUUID()).toMatch(UUID_V4);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('randomUUID — fallback total sin crypto', () => {
  it('sigue produciendo un UUID v4 válido con Math.random', () => {
    vi.stubGlobal('crypto', undefined);
    expect(randomUUID()).toMatch(UUID_V4);
  });

  it('no repite valores en una tanda (colisión = producción perdida)', () => {
    vi.stubGlobal('crypto', undefined);
    const ids = new Set(Array.from({ length: 500 }, () => randomUUID()));
    expect(ids.size).toBe(500);
  });
});

describe('randomUUID — longitud y separadores', () => {
  it('respeta el formato 8-4-4-4-12', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(0x3c) });
    const parts = randomUUID().split('-');
    expect(parts.map((p) => p.length)).toEqual([8, 4, 4, 4, 12]);
  });
});
