import { prisma } from '@/lib/prisma';

const DEFAULT_SUPABASE_API_BASE = 'https://api.supabase.com/v1';

const PAUSED_DB_ERROR_PATTERNS = [
  'tenant or user not found',
  'driveradaptererror',
  'connect timeout',
  'connection terminated unexpectedly',
  'getaddrinfo',
  'econnrefused',
  'enotfound',
];

const NOT_READY_PROJECT_STATUS_KEYWORDS = [
  'paused',
  'inactive',
  'coming_up',
  'coming up',
  'restoring',
];

interface SupabaseRecoveryConfig {
  projectRef: string | null;
  managementToken: string | null;
  apiBase: string;
}

interface SupabaseProjectResponse {
  status?: string;
}

interface SupabaseRestoreResponse {
  error?: string;
  message?: string;
}

export interface DbHealthCheckResult {
  dbState: 'up' | 'down';
  dbError: string | null;
  likelyPausedError: boolean;
  managementConfigured: boolean;
  projectStatus: string | null;
  projectStatusError: string | null;
}

export interface RecoveryActionResult {
  status:
    | 'db_active'
    | 'recovery_requested'
    | 'project_already_active'
    | 'recovery_failed'
    | 'recovery_config_missing'
    | 'db_error_unrecoverable';
  dbError: string | null;
  projectStatus: string | null;
  details: string | null;
}

function getRecoveryConfig(): SupabaseRecoveryConfig {
  return {
    projectRef: process.env.SUPABASE_PROJECT_REF?.trim() || null,
    managementToken: process.env.SUPABASE_MANAGEMENT_TOKEN?.trim() || null,
    apiBase: process.env.SUPABASE_MANAGEMENT_API_BASE?.trim() || DEFAULT_SUPABASE_API_BASE,
  };
}

function extractErrorMessage(error: unknown): string {
  const parts: string[] = [];
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (typeof current === 'string') {
      if (current.trim().length > 0) parts.push(current.trim());
      continue;
    }

    if (current instanceof Error) {
      if (current.message.trim().length > 0) parts.push(current.message.trim());
      if ('cause' in current && current.cause) queue.push(current.cause);
      continue;
    }

    if (typeof current === 'object') {
      const maybeMessage = (current as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
        parts.push(maybeMessage.trim());
      }
      const maybeError = (current as { error?: unknown }).error;
      if (typeof maybeError === 'string' && maybeError.trim().length > 0) {
        parts.push(maybeError.trim());
      }
      const maybeCause = (current as { cause?: unknown }).cause;
      if (maybeCause) queue.push(maybeCause);
    }
  }

  const uniqueParts = Array.from(new Set(parts.map((part) => part.toLowerCase())));
  return uniqueParts.join(' | ');
}

function isLikelyPausedSupabaseError(errorMessage: string): boolean {
  if (!errorMessage) return false;
  const normalized = errorMessage.toLowerCase();
  return PAUSED_DB_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isProjectReady(projectStatus: string | null): boolean {
  if (!projectStatus) return false;
  const normalized = projectStatus.toLowerCase();
  if (normalized.includes('active') && !NOT_READY_PROJECT_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  return false;
}

function isProjectNotReady(projectStatus: string | null): boolean {
  if (!projectStatus) return false;
  const normalized = projectStatus.toLowerCase();
  return NOT_READY_PROJECT_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function getProjectStatus(config: SupabaseRecoveryConfig): Promise<{ status: string | null; error: string | null }> {
  if (!config.projectRef || !config.managementToken) {
    return { status: null, error: 'management_not_configured' };
  }

  try {
    const response = await fetch(`${config.apiBase}/projects/${config.projectRef}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.managementToken}`,
      },
      cache: 'no-store',
    });

    const payload = await parseJsonSafe<SupabaseProjectResponse>(response);
    if (!response.ok) {
      const fallbackError = `supabase_status_http_${response.status}`;
      return {
        status: null,
        error: payload && typeof payload === 'object'
          ? extractErrorMessage(payload) || fallbackError
          : fallbackError,
      };
    }

    return {
      status: typeof payload?.status === 'string' ? payload.status : null,
      error: null,
    };
  } catch (error) {
    return { status: null, error: extractErrorMessage(error) || 'project_status_request_failed' };
  }
}

async function requestProjectRecovery(config: SupabaseRecoveryConfig): Promise<{ ok: boolean; details: string | null }> {
  if (!config.projectRef || !config.managementToken) {
    return { ok: false, details: 'management_not_configured' };
  }

  try {
    const response = await fetch(`${config.apiBase}/projects/${config.projectRef}/restore`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.managementToken}`,
      },
      cache: 'no-store',
    });

    const payload = await parseJsonSafe<SupabaseRestoreResponse>(response);

    if (response.ok) {
      return { ok: true, details: payload?.message || null };
    }

    const details = payload && typeof payload === 'object'
      ? extractErrorMessage(payload) || `supabase_restore_http_${response.status}`
      : `supabase_restore_http_${response.status}`;

    const alreadyRunning = details.includes('already') || details.includes('in progress');
    return { ok: alreadyRunning, details };
  } catch (error) {
    return { ok: false, details: extractErrorMessage(error) || 'project_restore_request_failed' };
  }
}

async function isDatabaseReachable(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function checkDatabaseHealth(): Promise<DbHealthCheckResult> {
  const config = getRecoveryConfig();

  try {
    await isDatabaseReachable();
    return {
      dbState: 'up',
      dbError: null,
      likelyPausedError: false,
      managementConfigured: Boolean(config.projectRef && config.managementToken),
      projectStatus: null,
      projectStatusError: null,
    };
  } catch (error) {
    const dbError = extractErrorMessage(error);
    const likelyPausedError = isLikelyPausedSupabaseError(dbError);
    const projectStatus = await getProjectStatus(config);

    return {
      dbState: 'down',
      dbError: dbError || 'database_connection_failed',
      likelyPausedError,
      managementConfigured: Boolean(config.projectRef && config.managementToken),
      projectStatus: projectStatus.status,
      projectStatusError: projectStatus.error,
    };
  }
}

export async function recoverPausedSupabaseProject(): Promise<RecoveryActionResult> {
  const health = await checkDatabaseHealth();
  if (health.dbState === 'up') {
    return {
      status: 'db_active',
      dbError: null,
      projectStatus: health.projectStatus,
      details: null,
    };
  }

  if (!health.likelyPausedError) {
    return {
      status: 'db_error_unrecoverable',
      dbError: health.dbError,
      projectStatus: health.projectStatus,
      details: health.projectStatusError,
    };
  }

  if (!health.managementConfigured) {
    return {
      status: 'recovery_config_missing',
      dbError: health.dbError,
      projectStatus: health.projectStatus,
      details: 'SUPABASE_PROJECT_REF / SUPABASE_MANAGEMENT_TOKEN are missing',
    };
  }

  if (isProjectReady(health.projectStatus)) {
    return {
      status: 'project_already_active',
      dbError: health.dbError,
      projectStatus: health.projectStatus,
      details: 'project reports active; try again in a few seconds',
    };
  }

  if (!isProjectNotReady(health.projectStatus) && health.projectStatus !== null) {
    return {
      status: 'recovery_failed',
      dbError: health.dbError,
      projectStatus: health.projectStatus,
      details: `unexpected_project_status_${health.projectStatus}`,
    };
  }

  const config = getRecoveryConfig();
  const recoveryResult = await requestProjectRecovery(config);

  return {
    status: recoveryResult.ok ? 'recovery_requested' : 'recovery_failed',
    dbError: health.dbError,
    projectStatus: health.projectStatus,
    details: recoveryResult.details,
  };
}
