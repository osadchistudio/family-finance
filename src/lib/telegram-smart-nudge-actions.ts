export type TelegramSmartNudgeAction = 'snooze' | 'dismiss';

const TELEGRAM_SMART_NUDGE_PREFIX = 'sn';
const TELEGRAM_ACTION_CODE: Record<TelegramSmartNudgeAction, string> = {
  snooze: 's',
  dismiss: 'd',
};

export function buildTelegramSmartNudgeCallbackData(
  action: TelegramSmartNudgeAction,
  nudgeKey: string
): string {
  return `${TELEGRAM_SMART_NUDGE_PREFIX}:${TELEGRAM_ACTION_CODE[action]}:${nudgeKey}`;
}

export function parseTelegramSmartNudgeCallbackData(value: unknown): {
  action: TelegramSmartNudgeAction;
  nudgeKey: string;
} | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/^sn:(s|d):(.+)$/);
  if (!match) {
    return null;
  }

  return {
    action: match[1] === 'd' ? 'dismiss' : 'snooze',
    nudgeKey: match[2],
  };
}
