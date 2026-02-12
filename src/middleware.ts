import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, isValidSessionToken } from '@/lib/auth';

const PUBLIC_ROUTES = ['/login'];
const PUBLIC_API_ROUTES = ['/api/auth/login', '/api/telegram/webhook'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (PUBLIC_API_ROUTES.some((path) => pathname.startsWith(path))) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname.startsWith('/sitemap.xml')) return true;
  if (pathname.startsWith('/robots.txt')) return true;
  if (pathname.startsWith('/public')) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = isValidSessionToken(token);

  if (isAuthenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
