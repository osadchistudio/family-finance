import { NextResponse } from 'next/server';
import { checkDatabaseHealth, recoverPausedSupabaseProject } from '@/lib/supabase-recovery';

const RECOVERY_COOLDOWN_MS = 60_000;

const globalForRecovery = globalThis as unknown as {
  supabaseRecoveryLastAttemptAt?: number;
};

export async function GET() {
  const health = await checkDatabaseHealth();
  return NextResponse.json(health, {
    status: health.dbState === 'up' ? 200 : 503,
  });
}

export async function POST() {
  const now = Date.now();
  const lastAttemptAt = globalForRecovery.supabaseRecoveryLastAttemptAt || 0;
  if (now - lastAttemptAt < RECOVERY_COOLDOWN_MS) {
    return NextResponse.json(
      {
        status: 'recovery_throttled',
        retryInSeconds: Math.ceil((RECOVERY_COOLDOWN_MS - (now - lastAttemptAt)) / 1000),
      },
      { status: 429 }
    );
  }

  globalForRecovery.supabaseRecoveryLastAttemptAt = now;
  const action = await recoverPausedSupabaseProject();
  const okStatuses = new Set(['db_active', 'recovery_requested', 'project_already_active']);

  return NextResponse.json(action, {
    status: okStatuses.has(action.status) ? 200 : 503,
  });
}
