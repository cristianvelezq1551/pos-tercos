import { jwtVerify } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';
import { POS_ALLOWED_ROLES } from './lib/auth-config';

const ACCESS_COOKIE = 'pos_access';
const APP = 'pos';
// En dev, localhost comparte cookies entre puertos: el navegador también manda
// la cookie del admin (admin_*) a esta app. Antes de proxiar al backend dejamos
// SOLO las cookies de esta app, así el backend nunca recibe la sesión de otra.
const FOREIGN_COOKIE_PREFIX = 'admin_';

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
    .filter((c) => !c.name.startsWith(FOREIGN_COOKIE_PREFIX))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const headers = new Headers(req.headers);
  headers.set('cookie', kept);
  headers.set('x-client-app', APP);
  return NextResponse.next({ request: { headers } });
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
  if (!token) {
    return redirectToLogin(req, pathname);
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    console.error('[middleware] JWT_ACCESS_SECRET missing — denying access');
    return redirectToLogin(req, pathname);
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const role = payload['role'];
    if (typeof role !== 'string' || !POS_ALLOWED_ROLES.includes(role as never)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }
    return NextResponse.next();
  } catch {
    return redirectToLogin(req, pathname);
  }
}

function redirectToLogin(req: NextRequest, pathname: string): NextResponse {
  const url = new URL('/login', req.url);
  if (pathname && pathname !== '/') {
    url.searchParams.set('redirect', pathname);
  }
  return NextResponse.redirect(url);
}

export const config = {
  // Corre en todo MENOS estáticos. Incluye /api para sanear cookies por app.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
