export const AUTH_COOKIE_NAME = 'ff_auth';
const SESSION_TTL_DAYS = 14;

const DEFAULT_USERNAME = 'osadchi.studio@gmail.com';
const DEFAULT_PASSWORD_SHA256 = '681fecde273adc84fe9bf821b759053006421a584f862f15f13fbad0f3742f7b';
const DEFAULT_COOKIE_TOKEN = 'ff_8e4f88f9ea4d42b9a1f4b6edb2e4ca6f';

export function getAuthUsername(): string {
  return process.env.AUTH_USERNAME?.trim().toLowerCase() || DEFAULT_USERNAME;
}

export function getAuthPasswordSha256(): string {
  return process.env.AUTH_PASSWORD_SHA256?.trim().toLowerCase() || DEFAULT_PASSWORD_SHA256;
}

export function getAuthCookieToken(): string {
  return process.env.AUTH_COOKIE_TOKEN?.trim() || DEFAULT_COOKIE_TOKEN;
}

export function getSessionMaxAgeSeconds(): number {
  return SESSION_TTL_DAYS * 24 * 60 * 60;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isValidCredentials(username: string, password: string): Promise<boolean> {
  const normalizedUser = username.trim().toLowerCase();
  if (!normalizedUser || !password) return false;

  const passwordHash = await sha256Hex(password);

  return normalizedUser === getAuthUsername()
    && passwordHash === getAuthPasswordSha256();
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  return token === getAuthCookieToken();
}
