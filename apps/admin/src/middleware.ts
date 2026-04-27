import { jwtVerify } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_ALLOWED_ROLES } from './lib/auth-config';

const ACCESS_COOKIE = 'pos_access';

const PUBLIC_PATHS = ['/login', '/unauthorized'];
const PUBLIC_PREFIXES = ['/_next', '/api', '/favicon', '/static'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
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
    if (typeof role !== 'string' || !ADMIN_ALLOWED_ROLES.includes(role as never)) {
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
  matcher: [
    // Run on everything except static and api proxy paths
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
