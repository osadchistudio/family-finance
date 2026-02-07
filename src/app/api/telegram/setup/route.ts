import { NextRequest, NextResponse } from 'next/server';
import { getTelegramBotService } from '@/services/telegram/TelegramBotService';

/**
 * Setup Telegram webhook
 * Call this endpoint once after deployment to configure the webhook
 *
 * POST /api/telegram/setup
 * Body: { "webhookUrl": "https://your-domain.com/api/telegram/webhook" }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_TOKEN is not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const webhookUrl = body.webhookUrl;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'webhookUrl is required' },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(webhookUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid webhookUrl format' },
        { status: 400 }
      );
    }

    const botService = getTelegramBotService();
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    const success = await botService.setWebhook(webhookUrl, secretToken);

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Webhook configured successfully',
        webhookUrl,
        secretConfigured: !!secretToken,
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to set webhook' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Telegram setup error:', error);
    return NextResponse.json(
      { error: 'Failed to setup webhook', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Remove Telegram webhook
 * Call this endpoint to disable the webhook
 */
export async function DELETE(): Promise<NextResponse> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_TOKEN is not configured' },
        { status: 500 }
      );
    }

    const botService = getTelegramBotService();
    const success = await botService.removeWebhook();

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Webhook removed successfully',
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to remove webhook' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Telegram webhook removal error:', error);
    return NextResponse.json(
      { error: 'Failed to remove webhook', details: String(error) },
      { status: 500 }
    );
  }
}
