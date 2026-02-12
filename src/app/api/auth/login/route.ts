import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  getAuthCookieToken,
  getSessionMaxAgeSeconds,
  isValidCredentials
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body?.username || '');
    const password = String(body?.password || '');

    const valid = await isValidCredentials(username, password);
    if (!valid) {
      return NextResponse.json(
        { error: 'שם משתמש או סיסמה שגויים' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: getAuthCookieToken(),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: getSessionMaxAgeSeconds(),
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: 'בקשה לא תקינה' },
      { status: 400 }
    );
  }
}
