import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * El middleware es el gate de la app de cocina. Mutantes que estos tests matan:
 * - dejar pasar las cookies `admin_*`/`pos_*` al proxiar `/api`: en localhost el
 *   navegador manda las tres y el backend autenticaría al cocinero con la sesión
 *   del DUEÑO (escalada de privilegios silenciosa).
 * - perder la entrada `/api/:path*` del matcher: el regex `/((?!...).*)` NO
 *   matchea `/api` en Next 15.5, así que sin ella las cookies ajenas viajan.
 * - aceptar un rol no autorizado (un cajero entrando a cocina).
 * - no intentar el refresh: el cocinero ve el login cada 24h en medio del turno.
 */

const jwtVerify = vi.fn();
vi.mock('jose', () => ({ jwtVerify: (...a: unknown[]) => jwtVerify(...a) }));

const { middleware, config } = await import('./middleware');

const SECRET = 'x'.repeat(40);

/** Request con las cookies dadas. */
function req(pathname: string, cookies: Record<string, string> = {}) {
  const jar = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return new NextRequest(`http://cocina.local${pathname}`, {
    headers: jar ? { cookie: jar } : {},
  });
}

const okRole = (role: string) => jwtVerify.mockResolvedValue({ payload: { role } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  process.env.JWT_ACCESS_SECRET = SECRET;
});

describe('aislamiento de cookies al proxiar /api', () => {
  it('saca las cookies de admin y pos antes de mandar al backend', async () => {
    const res = await middleware(
      req('/api/kitchen/stock', {
        cocina_access: 'tok-cocina',
        admin_access: 'tok-admin',
        pos_refresh: 'tok-pos',
      }),
    );
    const forwarded = res.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).toContain('cocina_access=tok-cocina');
    expect(forwarded).not.toContain('admin_access');
    expect(forwarded).not.toContain('pos_refresh');
  });

  it('declara la app con X-Client-App (el guard del API lo exige)', async () => {
    const res = await middleware(req('/api/kitchen/stock', { cocina_access: 'tok' }));
    expect(res.headers.get('x-middleware-request-x-client-app')).toBe('cocina');
  });

  it('no exige sesión para proxiar (la autorización la hace el backend)', async () => {
    const res = await middleware(req('/api/kitchen/stock'));
    expect(res.status).toBe(200);
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it('el matcher incluye /api explícito (el regex solo NO lo cubre en Next 15.5)', () => {
    expect(config.matcher).toContain('/api/:path*');
  });
});

describe('rutas públicas', () => {
  it.each(['/login', '/unauthorized'])('%s no pide sesión', async (path) => {
    const res = await middleware(req(path));
    expect(res.status).toBe(200);
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it.each(['/_next/static/x.js', '/favicon.ico', '/brand/logo.svg'])(
    '%s (asset) no pide sesión',
    async (path) => {
      expect((await middleware(req(path))).status).toBe(200);
    },
  );

  it('una ruta que EMPIEZA como pública pero no lo es sí pide sesión', async () => {
    const res = await middleware(req('/loginfalso'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });
});

describe('gate de rol', () => {
  it.each(['COCINERO', 'ADMIN_OPERATIVO', 'DUENO'])('deja entrar a %s', async (role) => {
    okRole(role);
    const res = await middleware(req('/inventario', { cocina_access: 'tok' }));
    expect(res.status).toBe(200);
  });

  it.each(['CAJERO', 'TRABAJADOR'])('manda a /unauthorized a %s', async (role) => {
    okRole(role);
    const res = await middleware(req('/inventario', { cocina_access: 'tok' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/unauthorized');
  });

  it('un token sin claim de rol se rechaza', async () => {
    jwtVerify.mockResolvedValue({ payload: {} });
    const res = await middleware(req('/inventario', { cocina_access: 'tok' }));
    expect(res.headers.get('location')).toContain('/unauthorized');
  });

  it('sin JWT_ACCESS_SECRET DENIEGA en vez de dejar pasar', async () => {
    delete process.env.JWT_ACCESS_SECRET;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await middleware(req('/inventario', { cocina_access: 'tok' }));
    expect(res.headers.get('location')).toContain('/login');
    expect(jwtVerify).not.toHaveBeenCalled();
  });
});

describe('sesión vencida → refresh transparente', () => {
  it('renueva el access con el refresh y sigue la request', async () => {
    jwtVerify.mockRejectedValueOnce(new Error('expired')).mockResolvedValue({
      payload: { role: 'COCINERO' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: 'tok-nuevo' }),
        headers: { getSetCookie: () => ['cocina_access=tok-nuevo; Path=/'] },
      }),
    );

    const res = await middleware(req('/inventario', { cocina_access: 'viejo', cocina_refresh: 'r' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-request-cookie')).toContain('cocina_access=tok-nuevo');
    expect(res.headers.getSetCookie()).toContain('cocina_access=tok-nuevo; Path=/');
  });

  it('sin cookie de refresh manda al login sin llamar al backend', async () => {
    jwtVerify.mockRejectedValue(new Error('expired'));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await middleware(req('/inventario', { cocina_access: 'viejo' }));
    expect(res.headers.get('location')).toContain('/login');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('si el refresh falla manda al login', async () => {
    jwtVerify.mockRejectedValue(new Error('expired'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const res = await middleware(req('/x', { cocina_access: 'viejo', cocina_refresh: 'r' }));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('si el backend está caído no revienta: manda al login', async () => {
    jwtVerify.mockRejectedValue(new Error('expired'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await middleware(req('/x', { cocina_access: 'viejo', cocina_refresh: 'r' }));
    expect(res.headers.get('location')).toContain('/login');
  });

  it('un refresh que devuelve un rol NO autorizado va a /unauthorized', async () => {
    jwtVerify.mockRejectedValueOnce(new Error('expired')).mockResolvedValue({
      payload: { role: 'CAJERO' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: 'tok-cajero' }),
        headers: { getSetCookie: () => [] },
      }),
    );
    const res = await middleware(req('/x', { cocina_access: 'viejo', cocina_refresh: 'r' }));
    expect(res.headers.get('location')).toContain('/unauthorized');
  });
});

describe('redirect al login', () => {
  it('conserva a dónde iba el usuario', async () => {
    jwtVerify.mockRejectedValue(new Error('expired'));
    const res = await middleware(req('/produccion', { cocina_access: 'viejo' }));
    expect(res.headers.get('location')).toContain('redirect=%2Fproduccion');
  });

  it('desde la raíz no agrega el parámetro', async () => {
    jwtVerify.mockRejectedValue(new Error('expired'));
    const res = await middleware(req('/', { cocina_access: 'viejo' }));
    expect(res.headers.get('location')).not.toContain('redirect=');
  });
});
