import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  getAuthCookieToken,
  getSessionMaxAgeSeconds,
  isValidCredentials
} from '@/lib/auth';
import {
  checkLoginRateLimit,
  clearAttempts,
  getClientIp,
  registerFailedAttempt
} from '@/lib/loginRateLimit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body?.username || '');
    const password = String(body?.password || '');
    const rememberMe = Boolean(body?.rememberMe);
    const clientIp = getClientIp(request);

    const rateLimitCheck = checkLoginRateLimit(clientIp);
    if (!rateLimitCheck.allowed) {
      const response = NextResponse.json(
        {
          error: `נחסמת זמנית בגלל ניסיונות התחברות רבים. נסה שוב בעוד ${Math.ceil(rateLimitCheck.retryAfterSeconds / 60)} דקות.`,
        },
        { status: 429 }
      );
      response.headers.set('Retry-After', String(rateLimitCheck.retryAfterSeconds));
      return response;
    }

    const valid = await isValidCredentials(username, password);
    if (!valid) {
      const failedState = registerFailedAttempt(clientIp);

      if (failedState.blockedNow) {
        const response = NextResponse.json(
          {
            error: `נחסמת זמנית בגלל ניסיונות התחברות רבים. נסה שוב בעוד ${Math.ceil(failedState.retryAfterSeconds / 60)} דקות.`,
          },
          { status: 429 }
        );
        response.headers.set('Retry-After', String(failedState.retryAfterSeconds));
        return response;
      }

      return NextResponse.json(
        {
          error: `שם משתמש או סיסמה שגויים. נשארו ${failedState.remainingAttempts} ניסיונות.`,
        },
        { status: 401 }
      );
    }

    clearAttempts(clientIp);

    const response = NextResponse.json({ success: true });
    const cookieOptions = {
      name: AUTH_COOKIE_NAME,
      value: getAuthCookieToken(),
      httpOnly: true as const,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    if (rememberMe) {
      response.cookies.set({
        ...cookieOptions,
        maxAge: getSessionMaxAgeSeconds(),
      });
    } else {
      response.cookies.set(cookieOptions);
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: 'בקשה לא תקינה' },
      { status: 400 }
    );
  }
}
