import { Telegraf, Context } from 'telegraf';
import { Message, Update } from 'telegraf/types';
import { prisma } from '@/lib/prisma';
import { FileParserService } from '@/services/parsers/FileParserService';
import { KeywordCategorizer } from '@/services/categorization/KeywordCategorizer';
import { RecurringKeywordMatcher } from '@/services/categorization/RecurringKeywordMatcher';

export interface TelegramUploadResult {
  success: boolean;
  message: string;
  imported?: number;
  duplicates?: number;
  errors?: number;
}

export class TelegramBotService {
  private bot: Telegraf;
  private fileParserService: FileParserService;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    this.bot = new Telegraf(token);
    this.fileParserService = new FileParserService();
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
          message += `   📝 ${upload.rowCount} תנועות | ${date}\n\n`;
        }

        await ctx.reply(message);
      } catch (error) {
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
        const errorMsg = parseResult.errors?.length > 0 ? parseResult.errors.join(', ') : 'לא נמצאו תנועות';
        await ctx.reply(`❌ שגיאה בפירוש הקובץ: ${errorMsg}`);
        return;
      }

      // Save to database
      const result = await this.saveTransactions(parseResult, filename);

      // Send success message
      const emoji = result.imported > 0 ? '✅' : '⚠️';
      let message = `${emoji} העלאה הושלמה!\n\n`;
      message += `📄 קובץ: ${filename}\n`;
      message += `🏦 מוסד: ${parseResult.institution}\n`;
      message += `📝 תנועות שיובאו: ${result.imported}\n`;

      if (result.duplicates > 0) {
        message += `🔄 כפילויות שדולגו: ${result.duplicates}\n`;
      }
      if (result.errors > 0) {
        message += `❌ שגיאות: ${result.errors}\n`;
      }

      await ctx.reply(message);

    } catch (error) {
      console.error('Telegram file upload error:', error);
      await ctx.reply('❌ שגיאה בעיבוד הקובץ. נסה שוב או העלה דרך הממשק.');
    }
  }

  /**
   * Save parsed transactions to database
   */
  private async saveTransactions(
    parseResult: Awaited<ReturnType<FileParserService['parseFile']>>,
    filename: string
  ): Promise<{ imported: number; duplicates: number; errors: number }> {
    const transactions = parseResult.transactions || [];
    let imported = 0;
    let duplicates = 0;
    let errors = 0;

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

    return { imported, duplicates, errors };
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
