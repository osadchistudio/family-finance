# Family Finance - Project Knowledge

Last updated: 2026-03-07

## Scope (Canonical)
This document is **only** for the `family-finance` web application

In scope:
- Finance management product (dashboard, transactions, monthly summary, recurring expenses, categories, tips, settings, upload)
- Next.js app code in this repository
- Deployment/runtime details for `osadchi-systems.com`

Out of scope:
- OCR Tool / Dictation / Figma plugins / any other project

## Stack
- Next.js 16.1.6 (App Router, standalone output)
- React 19
- Tailwind CSS v4 via `@tailwindcss/postcss`
- Prisma 7 + PostgreSQL (Supabase)
- PM2 process name: `family-finance`
- Active AI categorization provider: OpenAI only

## Production deployment (DigitalOcean)
- Server path: `/root/family-finance`
- Domain: `https://osadchi-systems.com`
- Required build flag:
  - `NODE_OPTIONS="--dns-result-order=ipv4first" npm run build`
- Standalone deployment must copy static/public/env:
  - `mkdir -p .next/standalone/.next/static`
  - `cp -r .next/static/* .next/standalone/.next/static/`
  - `cp -r public .next/standalone/public`
  - `cp .env .next/standalone/.env`

## Critical config files
- `/postcss.config.mjs` - required for Tailwind build
- `/prisma.config.ts` - required for Prisma schema resolution and Prisma CLI datasource config (`db push`, `generate`)

## Critical env keys
- `DATABASE_URL`
- `DIRECT_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default used: `gpt-5-mini`)
- `APP_BASE_URL` (optional, defaults to `https://osadchi-systems.com` for Telegram deep links)
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_WEBHOOK_SECRET` (optional)
- `TELEGRAM_ALLOWED_CHAT_IDS` (required in production for secure Telegram access)
- `TELEGRAM_REMINDER_SECRET` (required for cron-triggered Telegram reminders)
- `AUTH_USERNAME`
- `AUTH_PASSWORD_SHA256`
- `AUTH_COOKIE_TOKEN`
- `SUPABASE_PROJECT_REF` (optional, for auto-recovery)
- `SUPABASE_MANAGEMENT_TOKEN` (optional, for auto-recovery)

## Current product behavior (canonical)

### Authentication and access control
- App is protected behind login (`/login`)
- Middleware enforces auth for pages and APIs except explicit public routes
- Login supports `remember me`
- Brute-force protection exists (IP-based rate limiting)

### Transactions
- Three primary views:
  - `רשימה`
  - `מאוחד`
  - `לפי קטגוריה`
- Supports:
  - single-row category assignment
  - optional similar-transactions propagation (safety guarded)
  - per-row AI categorization
  - multi-select + bulk category assignment
  - single delete + bulk delete utilities
  - manual entry (`income` / `expense`)
  - amount-type filter (all / income / expense)
  - amount search (works for income + expense)
  - notes editing

### Category assignment intelligence
- Merchant-family similarity matching is used (not only exact description)
- Propagation has safety fuse to block over-broad updates
- In by-category context, row-level control is prioritized to avoid accidental mass updates

### Upload and parsing
- CSV/XLS/XLSX/PDF parsing pipeline
- PDF parsing supports Bank Hapoalim account statements and Isracard billing PDFs
- Consolidated credit-card charge rows in bank files are skipped to prevent double counting
- Amount sign parsing hardened (debit/credit correctness and edge minus formats)
- File uploads now track source metadata (`WEB` / `TELEGRAM`)
- Upload page shows recent upload history with source badges

### Telegram integration
- Telegram bot supports upload webhook flow for supported finance files
- Production access is restricted by `TELEGRAM_ALLOWED_CHAT_IDS`
- If `TELEGRAM_ALLOWED_CHAT_IDS` is missing in production, the bot rejects all chats and returns the current `chat_id` for configuration
- In non-production, missing `TELEGRAM_ALLOWED_CHAT_IDS` falls back to open access for local testing
- Upload replies now include quick links to `העלאות`, `תנועות`, and `לא מסווגות` when relevant
- Upload replies now show up to 3 example errors instead of only an error count
- Telegram reminder engine now supports:
  - weekly reminder day/hour configuration in `/settings`
  - rule checks for:
    - no uploads in the last 7 days
    - missing current-period data source (`עו"ש` / `אשראי`)
    - uncategorized transactions in the current period
  - test-send from `/settings`
  - secure cron trigger via `/api/telegram/reminders/run` guarded by `TELEGRAM_REMINDER_SECRET`

### Dashboard
- Presents generalized monthly picture (averages, not just current month totals)
- Uses complete periods for averages where possible
- Partial data periods are excluded from average basis and indicated
- Fault tolerance added so partial datasource failures do not crash full dashboard
- Charts render left-to-right for timeline clarity

### Monthly summary
- Supports calendar mode (1-1) and billing cycle mode (10-10) from global settings
- Month cards are sorted newest-to-oldest
- Category trend supports:
  - up to 5 categories
  - month range filter
  - averages in selected range
- Trend chart timeline renders left-to-right

### Recurring expenses
- Treated as monthly obligations (deduplicated recurring commitments)
- Supports amount strategy (highest / average)
- Shows remaining-for-variable estimate based on recent income window
- Includes suggestion engine:
  - propose adding recurring when pattern repeats
  - propose removing recurring when pattern stops
  - snooze support (30/90 days)

### Variable budget planning
- Monthly summary includes variable-budget planner (current + next period)
- Dashboard includes real-time variable-budget status card with warnings/over-limit alerts

### Reliability and recovery
- Added global app error fallback UI instead of generic white crash screen
- Added optional Supabase recovery endpoint:
  - checks DB status
  - checks Supabase project status
  - can request project restore when paused
- Requires `SUPABASE_PROJECT_REF` + `SUPABASE_MANAGEMENT_TOKEN` for automatic wake

## Planning documents
- Product roadmap and next recommended release batches:
  - `/docs/ROADMAP.md`

## Operational runbook

### If styling is broken in production
- Verify `/postcss.config.mjs` exists
- Rebuild and re-copy `.next/static` into standalone

### If app shows DB errors (`Tenant or user not found`)
- Verify Supabase project is active
- Verify `DATABASE_URL` and `DIRECT_URL` in:
  - `/root/family-finance/.env`
  - `/root/family-finance/.next/standalone/.env`
- Restart PM2 process after env changes

### If Supabase project was paused
- Resume project in Supabase
- App fallback UI can attempt auto-recovery if management env vars are configured

### If Telegram reminders do not fire
- Verify `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, and `TELEGRAM_REMINDER_SECRET`
- Verify `/settings` shows all Telegram reminder infrastructure flags as configured
- Verify cron calls `POST /api/telegram/reminders/run` with header:
  - `x-telegram-reminder-secret: <TELEGRAM_REMINDER_SECRET>`
- Manual server-side test:
  - `curl -X POST https://osadchi-systems.com/api/telegram/reminders/run -H "x-telegram-reminder-secret: ..."`
- Manual authenticated UI test:
  - use `שלח בדיקה עכשיו` in `/settings`

## Consolidated change log (major milestones)

### 2026-03-07 - Telegram reminder engine MVP
Why:
- Needed proactive freshness reminders because the product still relies on manual data uploads

What changed:
- Added Telegram reminder settings in `/settings`
- Added rule-based reminder evaluation:
  - no upload in last 7 days
  - missing current-period source
  - uncategorized transactions in current period
- Added secure cron trigger endpoint for scheduled Telegram reminders
- Added "send test now" action from settings

Files touched:
- `/src/lib/telegram-reminder-config.ts`
- `/src/lib/system-settings.ts`
- `/src/lib/telegram-reminders.ts`
- `/src/services/telegram/TelegramBotService.ts`
- `/src/app/settings/page.tsx`
- `/src/app/api/settings/telegram-reminders/route.ts`
- `/src/app/api/settings/telegram-reminders/test/route.ts`
- `/src/app/api/telegram/reminders/run/route.ts`
- `/src/middleware.ts`
- `/.env.example`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- Requires `TELEGRAM_REMINDER_SECRET` on production for cron execution

### 2026-03-06 - Telegram bot access hardening
Why:
- Existing Telegram webhook flow accepted files without chat-level authorization and needed a production-safe access gate

What changed:
- Added `TELEGRAM_ALLOWED_CHAT_IDS` env support
- Added chat authorization middleware in Telegram bot service
- Blocked unauthorized and unconfigured production chats before command/file processing
- Returned helpful rejection messages that include the sender `chat_id` for setup

Files touched:
- `/src/services/telegram/TelegramBotService.ts`
- `/.env.example`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- To use Telegram safely in production, configure `TELEGRAM_ALLOWED_CHAT_IDS`

### 2026-03-06 - Upload source tracking and recent upload visibility
Why:
- Telegram upload flow was working, but the app did not distinguish upload origin or expose a useful recent-upload inbox

What changed:
- Added `UploadSource` enum and `FileUpload.source`
- Marked web uploads as `WEB`
- Marked Telegram uploads as `TELEGRAM`
- Added recent upload history on `/upload` with source badges

Files touched:
- `/prisma/schema.prisma`
- `/prisma/migrations/20260306225000_add_upload_source/migration.sql`
- `/src/app/api/upload/route.ts`
- `/src/services/telegram/TelegramBotService.ts`
- `/src/app/upload/page.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Requires schema update before app restart:
  - `npx prisma db push`
- Normal deploy after schema sync

### 2026-03-07 - Prisma 7 datasource config fix for deploy commands
Why:
- Production deploy of upload-source tracking hit a Prisma CLI error during `npx prisma db push`
- Prisma 7 requires datasource URL to be declared in `prisma.config.ts` for CLI schema commands

What changed:
- Added `.env` auto-loading for Prisma CLI config
- Added `migrations.path`
- Added `datasource.url` wired to `DIRECT_URL` with fallback to `DATABASE_URL`
- Documented that `prisma db push` depends on this config

Files touched:
- `/prisma.config.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Future `npx prisma db push` and related Prisma CLI commands now work with the existing `.env`
- Prisma schema commands prefer `DIRECT_URL` (direct PostgreSQL connection) and only fall back to `DATABASE_URL`
- Full rebuild still required after schema changes

### 2026-03-07 - Telegram upload replies enriched with deep links and error samples
Why:
- Telegram upload flow worked, but the response was still too thin for real use on mobile
- Needed faster follow-up actions after upload and more actionable error feedback

What changed:
- Added quick-link buttons to open uploads and transactions directly from Telegram
- Added direct link to uncategorized transactions when imported rows remain unassigned
- Improved upload success/failure messages to include short error samples
- Added optional `APP_BASE_URL` for Telegram deep-link generation
- Added transactions page support for `?categoryId=uncategorized` initial filter

Files touched:
- `/src/services/telegram/TelegramBotService.ts`
- `/src/app/transactions/page.tsx`
- `/src/components/transactions/TransactionList.tsx`
- `/.env.example`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Full rebuild required
- No DB migration

### 2026-03-06 - Roadmap definition for next release batches
Why:
- Needed a concrete milestone plan focused on fresh-data workflows, Telegram ingestion, reminders, and current-month control

What changed:
- Added a dedicated roadmap document with:
  - release batches
  - Telegram MVP scope
  - reminder engine direction
  - current-month control-center direction
  - future smart nudges and Telegram command surface

Files touched:
- `/docs/ROADMAP.md`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Documentation-only change

### 2026-03-06 - Knowledge file normalization (scope cleanup)
Why:
- File grew too large with duplicate iterative entries and needed to remain canonical for this project only

What changed:
- Replaced verbose/duplicated timeline with a consolidated canonical document
- Kept only Family Finance-relevant architecture, behavior, and runbook info
- Explicitly documented scope boundaries (what is out of scope)

Files touched:
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Documentation-only change

### 2026-03-05 - Reliability + chart/timeline ordering improvements
Why:
- Needed production-safe behavior during Supabase pause incidents and consistent chart/time ordering UX

What changed:
- Added global error fallback UI + Supabase recovery API path
- Added optional Supabase management recovery env support
- Forced timeline charts to left-to-right plotting
- Enforced monthly summary card order: newest to oldest

Files touched:
- `/src/app/error.tsx`
- `/src/lib/supabase-recovery.ts`
- `/src/app/api/system/supabase-recovery/route.ts`
- `/src/components/dashboard/ExpenseChart.tsx`
- `/src/components/monthly-summary/CategoryExpenseTrendChart.tsx`
- `/src/components/monthly-summary/MonthlySummaryView.tsx`
- `/.env.example`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- Optional env needed for automatic Supabase wake behavior

### 2026-03-04 - Dashboard resilience + rolling averages
Why:
- Needed better stability and better representation of current spending behavior

What changed:
- Dashboard data loading hardened with fallback behavior
- Rolling average basis switched to recent 12 periods

Files touched:
- `/src/app/page.tsx`
- `/src/app/api/analytics/route.ts`
- `/src/lib/period-utils.ts`
- `/src/app/recurring/page.tsx`

Deploy/runtime impact:
- Normal deploy
- No DB migration

### 2026-02-23 - Variable budget planner and dashboard alerting
Why:
- Needed forward planning for variable categories and live over-budget visibility

What changed:
- Added variable budget planner in monthly summary
- Added dashboard budget status card with warning/over thresholds

Files touched:
- `/src/lib/variable-budget.ts`
- `/src/app/api/budgets/variable/route.ts`
- `/src/components/monthly-summary/VariableBudgetPlanner.tsx`
- `/src/components/dashboard/VariableBudgetStatusCard.tsx`
- `/src/app/monthly-summary/page.tsx`
- `/src/app/page.tsx`

Deploy/runtime impact:
- Normal deploy
- No DB migration (uses existing `Setting` table)

### 2026-02-22 - Mobile UX architecture + recurring suggestion framework
Why:
- Needed faster, cleaner mobile interaction and recurring suggestion lifecycle control

What changed:
- Added bottom mobile nav and simplified mobile drawer destinations
- Improved route transition feel and list rendering behavior
- Added recurring add/remove suggestions with snooze persistence
- Added mobile filter action-sheet flow for transactions

Files touched:
- `/src/components/Sidebar.tsx`
- `/src/components/LayoutShell.tsx`
- `/src/components/transactions/TransactionList.tsx`
- `/src/lib/recurring-suggestion-snooze.ts`
- `/src/app/transactions/page.tsx`
- `/src/app/api/transactions/bulk-recurring/route.ts`
- `/src/app/api/transactions/recurring-suggestions-snooze/route.ts`

Deploy/runtime impact:
- Normal deploy
- No DB migration

### 2026-02-21 - Transaction workflow hardening + manual entry
Why:
- Needed safer grouped updates and manual transaction insertion support

What changed:
- Added manual transaction create API and UI
- Fixed grouped-view category persistence behavior
- Added searchable bulk-category selector UX
- Included build hotfix for production typing issue

Files touched:
- `/src/app/api/transactions/route.ts`
- `/src/components/transactions/TransactionList.tsx`
- `/src/components/transactions/CategorySelector.tsx`
- `/src/app/api/transactions/bulk-category/route.ts`
- `/page.tsx`

Deploy/runtime impact:
- Normal deploy
- No DB migration

### 2026-02-15 - Global period mode + analytics consistency
Why:
- Needed one unified period logic across all analytics screens

What changed:
- Moved period mode to global Settings with shared utilities
- Applied period mode across dashboard/monthly-summary/recurring/tips/API
- Added partial-period exclusion logic for averages
- Consolidated analytics logic and restored ESLint infra

Files touched:
- `/src/lib/period-utils.ts`
- `/src/lib/system-settings.ts`
- `/src/lib/analytics.ts`
- `/src/app/settings/page.tsx`
- `/src/app/api/settings/period-mode/route.ts`
- `/src/app/page.tsx`
- `/src/app/monthly-summary/page.tsx`
- `/src/app/recurring/page.tsx`
- `/src/app/tips/page.tsx`
- `/src/app/api/analytics/route.ts`
- `/eslint.config.mjs`

Deploy/runtime impact:
- Normal deploy
- No DB migration

### 2026-02-14 - Monthly category trend feature expansion
Why:
- Needed actionable category-level trend analysis over time windows

What changed:
- Added category trend section in monthly summary
- Added multi-select categories (up to 5)
- Added from/to range filter and per-category averages

Files touched:
- `/src/components/monthly-summary/CategoryExpenseTrendChart.tsx`
- `/src/components/monthly-summary/MonthlySummaryView.tsx`
- `/src/app/monthly-summary/page.tsx`

Deploy/runtime impact:
- Normal deploy
- No DB migration

### 2026-02-13 - Categorization correctness and control upgrades
Why:
- Needed to reduce wrong mass category moves and improve categorization precision

What changed:
- Hardened amount sign parsing and debit/credit interpretation
- Added merchant-family similarity engine
- Added safety controls for propagation
- Added by-category notes editing and multi-select support
- Added scroll-to-top global utility

Files touched:
- `/src/services/parsers/FileParserService.ts`
- `/src/lib/merchantSimilarity.ts`
- `/src/app/api/transactions/[id]/category/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`
- `/src/components/transactions/CategorySelector.tsx`
- `/src/components/transactions/TransactionList.tsx`
- `/src/components/ui/ScrollToTopButton.tsx`

Deploy/runtime impact:
- Normal deploy
- No DB migration

### 2026-02-12 - Core product stabilization release
Why:
- Required foundational security, responsive UX, and data-quality controls

What changed:
- Added login gate and protected routes
- Added remember-me and brute-force protections
- Completed responsive/mobile baseline across core screens
- Reworked recurring page to monthly-obligations model
- Switched dashboard to average-oriented overview
- Added amount search, deletion utilities, icon picker upgrades
- Added parser rule to skip consolidated credit-card rows in bank import
- Restored production CSS + Prisma config compatibility

Files touched:
- `/src/middleware.ts`
- `/src/lib/auth.ts`
- `/src/lib/loginRateLimit.ts`
- `/src/app/login/page.tsx`
- `/src/components/auth/LoginForm.tsx`
- `/src/components/LayoutShell.tsx`
- `/src/components/Sidebar.tsx`
- `/src/components/recurring/RecurringExpensesList.tsx`
- `/src/app/page.tsx`
- `/src/components/transactions/TransactionList.tsx`
- `/src/services/parsers/FileParserService.ts`
- `/src/services/parsers/BankHapoalimPdfParser.ts`
- `/postcss.config.mjs`
- `/prisma.config.ts`

Deploy/runtime impact:
- Full rebuild required when config files were restored
- No DB migration

## Note for future updates
For every functional change in this repository, update this file in the same commit with:
- Date
- Why
- What changed
- Exact files touched
- Deploy/runtime impact

### 2026-03-07 - Removed legacy Anthropic remnants
Why:
- Anthropic is no longer part of the active product flow and leftover code created confusion about which AI provider is actually in use

What changed:
- Removed unused legacy root `route.ts` that called Anthropic directly
- Removed leftover `anthropic` keyword from the default digital-services seed data
- Clarified that OpenAI is the active categorization provider

Files touched:
- `/route.ts`
- `/prisma/seed.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No behavior change for active production flows
