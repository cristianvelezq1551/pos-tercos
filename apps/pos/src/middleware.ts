import { jwtVerify } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';
import { POS_ALLOWED_ROLES } from './lib/auth-config';

const ACCESS_COOKIE = 'pos_access';
const REFRESH_COOKIE = 'pos_refresh';
const APP = 'pos';
// En dev, localhost comparte cookies entre puertos: el navegador también manda
// las cookies de las otras apps (admin_*, cocina_*). Antes de proxiar al backend
// dejamos SOLO las cookies de esta app, así el backend nunca recibe la sesión de otra.
const FOREIGN_COOKIE_PREFIXES = ['admin_', 'cocina_'];
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const PUBLIC_PATHS = ['/login', '/unauthorized'];
const PUBLIC_PREFIXES = ['/_next', '/favicon', '/static', '/brand'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Reenvía la request al backend dejando solo las cookies de ESTA app. */
function forwardWithAppCookies(req: NextRequest): NextResponse {
  const kept = req.cookies
    .getAll()
    .filter((c) => !FOREIGN_COOKIE_PREFIXES.some((p) => c.name.startsWith(p)))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const headers = new Headers(req.headers);
  headers.set('cookie', kept);
  headers.set('x-client-app', APP);
  return NextResponse.next({ request: { headers } });
}

async function verifyRole(token: string): Promise<'ok' | 'forbidden' | 'invalid'> {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    console.error('[middleware] JWT_ACCESS_SECRET missing — denying access');
    return 'invalid';
  }
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const role = payload['role'];
    if (typeof role !== 'string' || !POS_ALLOWED_ROLES.includes(role as never)) {
      return 'forbidden';
    }
    return 'ok';
  } catch {
    return 'invalid';
  }
}

/**
 * Persistencia de sesión: si el access (24 h) expiró pero el refresh (7 d)
 * sigue vivo, renueva acá mismo — el usuario nunca ve la pantalla de login
 * mientras tenga refresh válido. Devuelve el access nuevo + los Set-Cookie
 * que el browser debe persistir, o null si no se pudo (→ login).
 */
async function attemptRefresh(
  req: NextRequest,
): Promise<{ accessToken: string; setCookies: string[] } | null> {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE}=${refresh}`, 'x-client-app': APP },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken?: string };
    if (!body.accessToken) return null;
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie') ?? ''].filter(Boolean);
    return { accessToken: body.accessToken, setCookies };
  } catch {
    return null;
  }
}

/** Continúa al destino con el access renovado visible para el SSR de ESTA request. */
function continueWithFreshAccess(
  req: NextRequest,
  accessToken: string,
  setCookies: string[],
): NextResponse {
  const pairs = req.cookies
    .getAll()
    .filter((c) => c.name !== ACCESS_COOKIE)
    .map((c) => `${c.name}=${c.value}`);
  pairs.push(`${ACCESS_COOKIE}=${accessToken}`);
  const headers = new Headers(req.headers);
  headers.set('cookie', pairs.join('; '));
  const response = NextResponse.next({ request: { headers } });
  for (const sc of setCookies) response.headers.append('set-cookie', sc);
  return response;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Proxy al backend: sanear cookies por app (sin gate; el backend autentica).
  if (pathname.startsWith('/api')) {
    return forwardWithAppCookies(req);
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const verdict = token ? await verifyRole(token) : 'invalid';

  if (verdict === 'ok') return NextResponse.next();
  if (verdict === 'forbidden') {
    return NextResponse.redirect(new URL('/unauthorized', req.url));
  }

  // Access ausente/vencido → intentar renovar con el refresh (7 días).
  const refreshed = await attemptRefresh(req);
  if (refreshed) {
    const refreshedVerdict = await verifyRole(refreshed.accessToken);
    if (refreshedVerdict === 'ok') {
      return continueWithFreshAccess(req, refreshed.accessToken, refreshed.setCookies);
    }
    if (refreshedVerdict === 'forbidden') {
      const response = NextResponse.redirect(new URL('/unauthorized', req.url));
      for (const sc of refreshed.setCookies) response.headers.append('set-cookie', sc);
      return response;
    }
  }
  return redirectToLogin(req, pathname);
}

function redirectToLogin(req: NextRequest, pathname: string): NextResponse {
  const url = new URL('/login', req.url);
  if (pathname && pathname !== '/') {
    url.searchParams.set('redirect', pathname);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // /api EXPLÍCITO: la entrada regex de abajo no matchea /api en Next 15.5
    // (verificado empíricamente) y sin middleware el proxy no sanea cookies →
    // las sesiones de admin y pos se mezclan en localhost.
    '/api/:path*',
    // Corre en todo MENOS estáticos. Incluye /api para sanear cookies por app.
    // `.*\..*` excluye archivos con extensión (svg, png, js…) de `public/`.
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
