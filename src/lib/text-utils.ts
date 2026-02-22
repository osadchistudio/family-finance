export function stripTrailingFinalDot(value: string): string {
  const trailingSpaces = value.match(/\s*$/)?.[0] ?? '';
  const core = value.slice(0, value.length - trailingSpaces.length);

  if (!core.endsWith('.')) return value;
  if (core.endsWith('...')) return value;

  return `${core.slice(0, -1)}${trailingSpaces}`;
}
