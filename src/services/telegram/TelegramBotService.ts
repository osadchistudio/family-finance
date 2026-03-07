import { Telegraf, Context, Markup } from 'telegraf';
import { Message, Update } from 'telegraf/types';
import { prisma } from '@/lib/prisma';
import { FileParserService } from '@/services/parsers/FileParserService';
import { KeywordCategorizer } from '@/services/categorization/KeywordCategorizer';
import { RecurringKeywordMatcher } from '@/services/categorization/RecurringKeywordMatcher';

export class TelegramBotService {
  private bot: Telegraf;
  private fileParserService: FileParserService;
  private allowedChatIds: Set<string>;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    this.bot = new Telegraf(token);
    this.fileParserService = new FileParserService();
    this.allowedChatIds = this.parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  }

  /**
   * Get the bot instance for webhook handling
   */
  getBot(): Telegraf {
    return this.bot;
  }

  /**
   * Handle incoming updates from Telegram webhook
   */
  async handleUpdate(update: Update): Promise<void> {
    await this.bot.handleUpdate(update);
  }

  /**
   * Initialize bot commands and handlers
   */
  initialize(): void {
    this.bot.use(async (ctx, next) => {
      const access = this.getAccessState(ctx);

      if (access.authorized) {
        return next();
      }

      console.warn('Telegram bot unauthorized access blocked', {
        chatId: access.chatId,
        username: ctx.from?.username || null,
        firstName: ctx.from?.first_name || null,
        reason: access.reason,
      });

      if ('chat' in ctx && ctx.chat) {
        await ctx.reply(this.getUnauthorizedMessage(access.reason, access.chatId));
      }
    });

    // /start command
    this.bot.start(async (ctx) => {
      await ctx.reply(
        '👋 שלום! אני הבוט של ניהול הכספים המשפחתי.\n\n' +
        '📎 שלח לי קובץ (CSV, Excel או PDF) של תנועות בנק או כרטיס אשראי ואני אעלה אותו למערכת.\n\n' +
        '📊 פקודות זמינות:\n' +
        '/status - סיכום העלאות אחרונות\n' +
        '/help - עזרה'
      );
    });

    // /help command
    this.bot.help(async (ctx) => {
      await ctx.reply(
        '📋 איך להשתמש:\n\n' +
        '1. שלח קובץ CSV, Excel או PDF\n' +
        '2. המערכת תזהה אוטומטית את המוסד הפיננסי\n' +
        '3. תקבל סיכום של התנועות שיובאו\n\n' +
        '🏦 מוסדות נתמכים:\n' +
        '• בנק הפועלים\n' +
        '• בנק לאומי\n' +
        '• ישראכרט\n' +
        '• לאומי קארד\n' +
        '• מקס\n' +
        '• ויזה כאל'
      );
    });

    // /status command
    this.bot.command('status', async (ctx) => {
      try {
        const recentUploads = await prisma.fileUpload.findMany({
          take: 5,
          orderBy: { processedAt: 'desc' },
          select: {
            filename: true,
            rowCount: true,
            source: true,
            processedAt: true,
            account: {
              select: {
                institution: true,
              },
            },
          },
        });

        if (recentUploads.length === 0) {
          await ctx.reply('📭 אין העלאות אחרונות.');
          return;
        }

        let message = '📊 העלאות אחרונות:\n\n';
        for (const upload of recentUploads) {
          const date = upload.processedAt.toLocaleDateString('he-IL');
          message += `📄 ${upload.filename}\n`;
          message += `   🏦 ${upload.account.institution || 'לא ידוע'}\n`;
          message += `   ${upload.source === 'TELEGRAM' ? '📲' : '🌐'} ${upload.source === 'TELEGRAM' ? 'טלגרם' : 'אתר'} | ${upload.rowCount} תנועות | ${date}\n\n`;
        }

        await ctx.reply(message, this.buildPostUploadKeyboard({ hasTransactions: true, hasUncategorized: false }));
      } catch {
        await ctx.reply('❌ שגיאה בקבלת סטטוס. נסה שוב מאוחר יותר.');
      }
    });

    // Handle document uploads
    this.bot.on('document', async (ctx) => {
      await this.handleFileUpload(ctx);
    });

    // Handle unknown messages
    this.bot.on('message', async (ctx) => {
      if (!('document' in ctx.message)) {
        await ctx.reply(
          '🤔 לא הבנתי. שלח לי קובץ (CSV, Excel או PDF) או הקלד /help לעזרה.'
        );
      }
    });
  }

  /**
   * Handle file upload from Telegram
   */
  private async handleFileUpload(ctx: Context & { message: Message.DocumentMessage }): Promise<void> {
    const document = ctx.message.document;
    const filename = document.file_name || 'unknown';

    // Validate file type
    const validExtensions = ['.csv', '.xlsx', '.xls', '.pdf'];
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));

    if (!validExtensions.includes(ext)) {
      await ctx.reply(
        `❌ סוג קובץ לא נתמך: ${ext}\n\n` +
        '📎 סוגי קבצים נתמכים: CSV, Excel (xlsx, xls), PDF'
      );
      return;
    }

    // Check file size (max 20MB for Telegram)
    if (document.file_size && document.file_size > 20 * 1024 * 1024) {
      await ctx.reply('❌ הקובץ גדול מדי. מקסימום 20MB.');
      return;
    }

    await ctx.reply('⏳ מעבד את הקובץ...');

    try {
      // Download file from Telegram
      const fileLink = await ctx.telegram.getFileLink(document.file_id);
      const response = await fetch(fileLink.href);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Parse the file
      const parseResult = await this.fileParserService.parseFile(buffer, filename);

      if (!parseResult.transactions || parseResult.transactions.length === 0) {
        const errorMsg = this.formatErrorSamples(parseResult.errors);
        await ctx.reply(
          `❌ לא הצלחתי לייבא תנועות מהקובץ\n\n${errorMsg}`,
          this.buildPostUploadKeyboard({ hasTransactions: false, hasUncategorized: false })
        );
        return;
      }

      // Save to database
      const result = await this.saveTransactions(parseResult, filename);

      // Send success message
      const emoji = result.imported > 0 ? '✅' : result.duplicates > 0 ? 'ℹ️' : '⚠️';
      let message = `${emoji} העלאה הושלמה\n\n`;
      message += `📄 קובץ: ${filename}\n`;
      message += `🏦 מוסד: ${parseResult.institution}\n`;
      message += `📝 תנועות שיובאו: ${result.imported}\n`;

      if (result.duplicates > 0) {
        message += `🔄 כפילויות שדולגו: ${result.duplicates}\n`;
      }
      if (result.uncategorized > 0) {
        message += `🏷️ לא משויכות: ${result.uncategorized}\n`;
      }
      if (result.errors > 0) {
        message += `❌ שגיאות: ${result.errors}\n`;
        const errorPreview = this.formatErrorSamples([
          ...parseResult.errors,
          ...result.errorDetails,
        ]);
        if (errorPreview) {
          message += `\n${errorPreview}\n`;
        }
      }

      await ctx.reply(
        message.trim(),
        this.buildPostUploadKeyboard({
          hasTransactions: result.imported > 0 || result.duplicates > 0,
          hasUncategorized: result.uncategorized > 0,
        })
      );

    } catch (error) {
      console.error('Telegram file upload error:', error);
      await ctx.reply(
        '❌ שגיאה בעיבוד הקובץ\nנסה שוב או פתח את מסך ההעלאות במערכת',
        this.buildPostUploadKeyboard({ hasTransactions: false, hasUncategorized: false })
      );
    }
  }

  /**
   * Save parsed transactions to database
   */
  private async saveTransactions(
    parseResult: Awaited<ReturnType<FileParserService['parseFile']>>,
    filename: string
  ): Promise<{
    imported: number;
    duplicates: number;
    errors: number;
    uncategorized: number;
    errorDetails: string[];
  }> {
    const transactions = parseResult.transactions || [];
    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    let uncategorized = 0;
    const errorDetails: string[] = [];

    // Get or create account
    const accountName = `${parseResult.institution} - ${parseResult.cardNumber || 'חשבון'}`;
    let account = await prisma.account.findFirst({
      where: {
        OR: [
          { cardNumber: parseResult.cardNumber || undefined },
          { name: accountName },
        ],
      },
    });

    if (!account) {
      account = await prisma.account.create({
        data: {
          name: accountName,
          institution: parseResult.institution || 'UNKNOWN',
          cardNumber: parseResult.cardNumber || null,
        },
      });
    }

    // Load categorizers
    const keywordCategorizer = new KeywordCategorizer();
    await keywordCategorizer.loadKeywords();
    const recurringMatcher = new RecurringKeywordMatcher();
    await recurringMatcher.loadKeywords();

    // Create file upload record
    const fileUpload = await prisma.fileUpload.create({
      data: {
        filename,
        originalName: filename,
        rowCount: transactions.length,
        status: 'PROCESSING',
        accountId: account.id,
        source: 'TELEGRAM',
      },
    });

    // Process transactions
    for (const tx of transactions) {
      try {
        // Check for duplicates
        const existing = await prisma.transaction.findFirst({
          where: {
            OR: [
              { reference: tx.reference || undefined },
              {
                AND: [
                  { date: tx.date },
                  { amount: tx.amount },
                  { description: tx.description },
                  { accountId: account.id },
                ],
              },
            ],
          },
        });

        if (existing) {
          duplicates++;
          continue;
        }

        // Auto-categorize
        const categorizationResult = await keywordCategorizer.categorize(tx.description);
        const categoryId = categorizationResult?.categoryId || null;
        const isRecurring = await recurringMatcher.match(tx.description);
        if (!categoryId) {
          uncategorized++;
        }

        // Create transaction
        await prisma.transaction.create({
          data: {
            date: tx.date,
            description: tx.description,
            amount: tx.amount,
            reference: tx.reference || null,
            accountId: account.id,
            categoryId,
            isRecurring,
            isAutoCategorized: !!categoryId,
            fileUploadId: fileUpload.id,
          },
        });

        imported++;
      } catch (error) {
        console.error('Error saving transaction:', error);
        errors++;
        if (errorDetails.length < 3) {
          const reason = error instanceof Error ? error.message : 'שגיאה לא ידועה';
          errorDetails.push(`${tx.description} — ${reason}`);
        }
      }
    }

    // Update file upload status
    await prisma.fileUpload.update({
      where: { id: fileUpload.id },
      data: {
        status: 'COMPLETED',
        rowCount: imported,
      },
    });

    return { imported, duplicates, errors, uncategorized, errorDetails };
  }

  /**
   * Set webhook URL for the bot
   */
  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    try {
      await this.bot.telegram.setWebhook(url, {
        secret_token: secretToken,
      });
      return true;
    } catch (error) {
      console.error('Failed to set webhook:', error);
      return false;
    }
  }

  /**
   * Remove webhook (for switching to polling)
   */
  async removeWebhook(): Promise<boolean> {
    try {
      await this.bot.telegram.deleteWebhook();
      return true;
    } catch (error) {
      console.error('Failed to remove webhook:', error);
      return false;
    }
  }

  private parseAllowedChatIds(rawValue?: string): Set<string> {
    if (!rawValue) {
      return new Set();
    }

    return new Set(
      rawValue
        .split(/[,\s]+/)
        .map((value) => value.trim())
        .filter(Boolean)
    );
  }

  private getAccessState(ctx: Context): {
    authorized: boolean;
    chatId: string | null;
    reason: 'missing-chat' | 'not-configured' | 'not-allowed';
  } {
    const chatId = ctx.chat?.id != null ? String(ctx.chat.id) : null;

    if (!chatId) {
      return { authorized: false, chatId: null, reason: 'missing-chat' };
    }

    if (this.allowedChatIds.size === 0) {
      if (process.env.NODE_ENV !== 'production') {
        return { authorized: true, chatId, reason: 'not-configured' };
      }

      return { authorized: false, chatId, reason: 'not-configured' };
    }

    if (this.allowedChatIds.has(chatId)) {
      return { authorized: true, chatId, reason: 'not-allowed' };
    }

    return { authorized: false, chatId, reason: 'not-allowed' };
  }

  private getUnauthorizedMessage(
    reason: 'missing-chat' | 'not-configured' | 'not-allowed',
    chatId: string | null
  ): string {
    if (reason === 'missing-chat') {
      return '⛔ לא הצלחתי לזהות את הצ׳אט שממנו נשלחה הבקשה';
    }

    if (reason === 'not-configured') {
      return [
        '⚠️ הבוט עדיין לא הוגדר לגישה מאובטחת',
        chatId ? `Chat ID לזיהוי: ${chatId}` : null,
        'יש להגדיר בשרת את TELEGRAM_ALLOWED_CHAT_IDS לפני שימוש'
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      '⛔ הצ׳אט הזה לא מורשה להשתמש בבוט',
      chatId ? `Chat ID לזיהוי: ${chatId}` : null,
      'אם זו גישה תקינה, יש להוסיף את ה-Chat ID ל-TELEGRAM_ALLOWED_CHAT_IDS'
    ]
      .filter(Boolean)
      .join('\n');
  }

  private getAppBaseUrl(): string {
    return (process.env.APP_BASE_URL || 'https://osadchi-systems.com').replace(/\/+$/, '');
  }

  private buildPostUploadKeyboard({
    hasTransactions,
    hasUncategorized,
  }: {
    hasTransactions: boolean;
    hasUncategorized: boolean;
  }) {
    const baseUrl = this.getAppBaseUrl();
    const buttons = [];

    if (hasUncategorized) {
      buttons.push([
        Markup.button.url('פתח לא מסווגות', `${baseUrl}/transactions?categoryId=uncategorized`),
      ]);
    }

    if (hasTransactions) {
      buttons.push([
        Markup.button.url('פתח תנועות', `${baseUrl}/transactions`),
        Markup.button.url('פתח העלאות', `${baseUrl}/upload`),
      ]);
    } else {
      buttons.push([
        Markup.button.url('פתח העלאות', `${baseUrl}/upload`),
      ]);
    }

    return Markup.inlineKeyboard(buttons);
  }

  private formatErrorSamples(errors: string[]): string {
    const normalizedErrors = errors
      .map((error) => error.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (normalizedErrors.length === 0) {
      return '';
    }

    return [
      'דוגמאות לשגיאות:',
      ...normalizedErrors.map((error, index) => `${index + 1}) ${error}`),
    ].join('\n');
  }
}

// Singleton instance
let botService: TelegramBotService | null = null;

export function getTelegramBotService(): TelegramBotService {
  if (!botService) {
    botService = new TelegramBotService();
    botService.initialize();
  }
  return botService;
}
