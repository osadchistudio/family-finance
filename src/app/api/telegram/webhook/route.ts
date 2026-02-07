import { NextRequest, NextResponse } from 'next/server';
import { getTelegramBotService } from '@/services/telegram/TelegramBotService';

/**
 * Telegram Webhook endpoint
 * Receives updates from Telegram servers
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify webhook secret if configured
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secretToken) {
      const headerToken = request.headers.get('x-telegram-bot-api-secret-token');
      if (headerToken !== secretToken) {
        console.warn('Telegram webhook: Invalid secret token');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Check if bot token is configured
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN is not configured');
      return NextResponse.json({ error: 'Bot not configured' }, { status: 500 });
    }

    // Parse the update from Telegram
    const update = await request.json();

    // Process the update
    const botService = getTelegramBotService();
    await botService.handleUpdate(update);

    // Always return 200 to Telegram (even if processing failed)
    // to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    // Return 200 even on error to prevent Telegram retry loops
    return NextResponse.json({ ok: true });
  }
}

/**
 * GET endpoint for webhook setup verification
 */
export async function GET(): Promise<NextResponse> {
  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const hasSecret = !!process.env.TELEGRAM_WEBHOOK_SECRET;

  return NextResponse.json({
    status: 'ok',
    configured: hasToken,
    secretConfigured: hasSecret,
    message: hasToken
      ? 'Telegram webhook is ready'
      : 'TELEGRAM_BOT_TOKEN is not set',
  });
}
