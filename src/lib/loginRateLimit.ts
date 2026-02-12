import { NextRequest } from 'next/server';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 7;
const BLOCK_DURATION_MS = 30 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;

interface AttemptState {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number | null;
  lastSeenAt: number;
}

const attemptsByIp = new Map<string, AttemptState>();

function cleanupStale(now: number) {
  for (const [key, state] of attemptsByIp.entries()) {
    if (now - state.lastSeenAt > STALE_TTL_MS) {
      attemptsByIp.delete(key);
    }
  }
}

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

export function checkLoginRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
} {
  const now = Date.now();
  cleanupStale(now);

  const state = attemptsByIp.get(ip);
  if (!state) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: MAX_ATTEMPTS_PER_WINDOW,
    };
  }

  state.lastSeenAt = now;

  if (state.blockedUntil && state.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000),
      remainingAttempts: 0,
    };
  }

  // Window expired: reset attempts.
  if (now - state.firstFailureAt > WINDOW_MS) {
    attemptsByIp.delete(ip);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: MAX_ATTEMPTS_PER_WINDOW,
    };
  }

  const remainingAttempts = Math.max(0, MAX_ATTEMPTS_PER_WINDOW - state.failures);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts,
  };
}

export function registerFailedAttempt(ip: string): {
  blockedNow: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
} {
  const now = Date.now();
  cleanupStale(now);

  const current = attemptsByIp.get(ip);

  if (!current || now - current.firstFailureAt > WINDOW_MS) {
    attemptsByIp.set(ip, {
      failures: 1,
      firstFailureAt: now,
      blockedUntil: null,
      lastSeenAt: now,
    });

    return {
      blockedNow: false,
      retryAfterSeconds: 0,
      remainingAttempts: MAX_ATTEMPTS_PER_WINDOW - 1,
    };
  }

  const nextFailures = current.failures + 1;
  const blockedNow = nextFailures >= MAX_ATTEMPTS_PER_WINDOW;
  const blockedUntil = blockedNow ? now + BLOCK_DURATION_MS : null;

  attemptsByIp.set(ip, {
    failures: nextFailures,
    firstFailureAt: current.firstFailureAt,
    blockedUntil,
    lastSeenAt: now,
  });

  return {
    blockedNow,
    retryAfterSeconds: blockedNow ? Math.ceil(BLOCK_DURATION_MS / 1000) : 0,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS_PER_WINDOW - nextFailures),
  };
}

export function clearAttempts(ip: string) {
  attemptsByIp.delete(ip);
}
