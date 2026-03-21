# Family Finance - Project Knowledge

Last updated: 2026-03-12

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
  - transaction-description editing from the transactions UI
    - mobile: long-press on the transaction name
    - desktop: right-click on the transaction name
    - optional bulk propagation to similar transactions from the same merchant family
    - if the corrected name already exists on an otherwise identical transaction, the app now merges into the existing row instead of blocking on duplicate-key error
    - the surviving existing row keeps its category, while notes/flags from the duplicate row are preserved

### Category assignment intelligence
- Merchant-family similarity matching is used (not only exact description)
- Propagation has safety fuse to block over-broad updates
- In by-category context, row-level control is prioritized to avoid accidental mass updates

### Upload and parsing
- CSV/XLS/XLSX/PDF parsing pipeline
- PDF parsing supports Bank Hapoalim account statements and Isracard billing PDFs
- Isracard PDF parsing now uses `pdf-parse` extraction instead of `unpdf` because `unpdf` collapsed Hebrew merchant-name spaces in this PDF type
- Re-uploading the same Isracard PDF after the parser fix can repair previously imported compacted descriptions by upgrading matching existing rows in-place
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
- Telegram upload duplicate conflicts from the DB unique key are treated as duplicates, not surfaced as import errors
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

### 2026-03-21 - Aligned learned merchant-history grouping with audit family keys
Why:
- The cross-history audit showed that the remaining risk is not missed uncategorized inheritance, but noisy merchant families around transfers and `BIT`-style descriptions
- The production historical categorizer and the audit script were still grouping merchant history with different keys, which made it harder to trust that ambiguous families flagged by the audit were truly excluded from learned-history categorization

What changed:
- Added a shared merchant-family key helper so both production categorization and the audit script now derive merchant families the same way
- Updated learned-history candidate grouping to use the shared merchant-family key instead of the full compacted description or merchant name
- Tightened learned-history acceptance again so a merchant family now needs at least `75%` category dominance before it is eligible for automatic inheritance from history

Files touched:
- `/src/lib/merchantSimilarity.ts`
- `/src/services/categorization/KeywordCategorizer.ts`
- `/scripts/merchantCategorizationAudit.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Historical auto-categorization is now more conservative for ambiguous transfer-like merchant families, and the audit output is now directly comparable to production grouping behavior

### 2026-03-20 - Hardened historical merchant-family categorization against noisy history
Why:
- The next priority after restoring production was to verify that merchant-history learning does not overfit on partial or noisy categorized history
- The previous historical candidate builder only looked at the latest 4000 categorized transactions and could still accept weak dominant-category wins such as `2 vs 1`, which is too noisy for reliable merchant-family learning

What changed:
- Updated the historical categorization candidate builder to scan the full categorized transaction history instead of capping itself at the latest 4000 rows
- Tightened dominant-category acceptance so a merchant family now needs both at least 2 samples and a stronger dominance ratio before it is eligible for learned-history categorization
- Changed the representative sample used for each learned merchant family to come from the winning category itself, instead of whichever categorized row happened to be seen first in the group

Files touched:
- `/src/services/categorization/KeywordCategorizer.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Historical merchant-based auto-categorization should now be more conservative and more stable across the full categorized history

### 2026-03-20 - Stabilized merchant-name merges when renaming into an existing transaction
Why:
- Editing a merchant name into an already-existing canonical name still had edge cases where the DB merge succeeded only partially from the user's perspective
- Similar-transaction propagation treated successful merges as skipped conflicts, and a rare duplicate race could still surface as a failed rename instead of attaching to the canonical row

What changed:
- Hardened `PATCH /api/transactions/[id]/description` so a late duplicate-key race now re-finds the canonical transaction and merges into it instead of returning a duplicate failure
- Updated similar-name propagation to report real merges separately from in-place updates, including deleted duplicate IDs and the final canonical transactions that absorbed them
- Updated the transactions UI to remove merged-away duplicates from the local list, refresh surviving canonical rows in place, and show success messages that distinguish between updated similar rows and merged similar rows

Files touched:
- `/src/app/api/transactions/[id]/description/route.ts`
- `/src/components/transactions/TransactionList.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Merchant rename flows are now more reliable when the new name already exists on one or more matching transactions

### 2026-03-20 - Fixed production build TypeScript error in single auto-categorize route
Why:
- The latest deploy failed during `next build`, which prevented `.next/standalone/server.js` from being generated and left production returning `502` behind Caddy
- The failing code path in the single-transaction auto-categorize API accessed `.startsWith()` through an optional chain in a way TypeScript rejected during the production build

What changed:
- Updated both auto-categorize API routes to type Prisma category collections explicitly as `AutoCategorizeCategory[]`, so helper lookups like `findCategoryByName()` stay assignable during `next build`
- Updated the single-transaction auto-categorize API response builder to compute the categorization source through a null-safe expression before returning JSON
- Preserved the existing business behavior: historical learned matches still report `history`, learned keyword matches still report `keywords`, and AI fallbacks still report `ai`

Files touched:
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`
- `/src/app/api/transactions/auto-categorize/route.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Restores successful production builds so the standalone server artifact can be generated again
### 2026-03-12 - Made manual transaction-name edits merge into existing categorized rows
Why:
- Correcting compacted merchant names such as `אייזקסמעדניגורמה` to an already-existing clean name triggered the transaction unique key and blocked the user with a duplicate error
- In practice these conflicts usually represent the same underlying transaction, so blocking prevented the desired outcome of attaching the corrected merchant to the existing category

What changed:
- Updated `PATCH /api/transactions/[id]/description` so that duplicate-key conflicts now resolve by merging into the existing matching transaction instead of returning a hard error
- The merge keeps the existing canonical row, preserves its category, and carries over useful metadata from the duplicate row such as notes, recurring/excluded flags, reference, and missing value date/fileUpload relation when relevant
- Similar-name propagation now uses the same merge-aware logic, so duplicate conflicts found while applying the rename to similar rows are cleaned up instead of surfacing as failures
- Updated the transactions UI so a successful merge removes the duplicate row from the live list, refreshes any surviving canonical row in-place, and shows a success toast explaining that the transaction was attached to the existing categorized record
- Clarified the helper text in the edit modal so users know that renaming to an already-existing merchant can intentionally reuse the current category assignment

Files touched:
- `/src/app/api/transactions/[id]/description/route.ts`
- `/src/components/transactions/TransactionList.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- After deploy, editing a transaction name to an already-existing canonical merchant name will merge duplicates instead of throwing a duplicate error

### 2026-03-12 - Added manual transaction-name editing from the transactions UI
Why:
- Some uploaded merchants still need manual cleanup, especially when external statements merge Hebrew words or produce inconsistent merchant variants
- The product already supports bulk category learning, but there was no direct way to fix the raw transaction description itself

What changed:
- Added a new `PATCH /api/transactions/[id]/description` endpoint for updating the transaction description and merchant name together
- Added optional propagation to similar transactions from the same merchant family, with a safety cap to prevent over-broad bulk edits
- Added a new transactions UI interaction model for editing names without adding persistent extra controls:
  - mobile long-press on transaction name
  - desktop right-click on transaction name
- Added a dedicated edit modal that previews the current name, lets the user set a new value, and optionally apply the change to similar rows

Files touched:
- `/src/app/api/transactions/[id]/description/route.ts`
- `/src/components/transactions/TransactionList.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- After deploy, transaction names can be fixed manually in-place and optionally propagated to similar transactions

### 2026-03-11 - Fixed Isracard PDF merchant spacing for web and Telegram uploads
Why:
- Recent Isracard PDF uploads collapsed Hebrew spaces inside merchant names (for example `מרכוליתהגשר` instead of `מרכולית הגשר`), which broke keyword categorization and left valid transactions uncategorized

What changed:
- Switched Isracard PDF text extraction to `pdf-parse` because it preserves spaces correctly for this PDF format
- Hardened Isracard header/section detection to work with spaced text extraction
- Stopped joining domestic PDF chunk lines without spaces
- Filtered known Isracard promotional continuation text so it no longer appends into merchant descriptions
- Strengthened merchant-similarity matching and historical categorization fallback so compact historical descriptions can still match spaced future imports
- Upgraded duplicate reconciliation in both web upload and Telegram upload flows so re-uploading the corrected file can patch existing compacted rows in-place
- Added `pdf-parse` as an explicit production dependency

Files touched:
- `/src/services/parsers/pdfText.ts`
- `/src/services/parsers/IsracardPdfParser.ts`
- `/src/services/parsers/FileParserService.ts`
- `/src/lib/merchantSimilarity.ts`
- `/src/services/categorization/KeywordCategorizer.ts`
- `/src/services/categorization/RecurringKeywordMatcher.ts`
- `/src/app/api/upload/route.ts`
- `/src/services/telegram/TelegramBotService.ts`
- `/package.json`
- `/package-lock.json`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- Requires `npm install` on deploy because `pdf-parse` was added as a direct dependency
- Existing compacted Isracard rows can be repaired by re-uploading the same PDF after deploy

### 2026-03-19 - Fixed mobile category visibility in the monthly summary variable budget planner
Why:
- On mobile, the variable budget planner in `/monthly-summary` used the same four-column table layout as desktop
- That layout squeezed the category column so tightly that category names were effectively unreadable on phones, making budget review and editing difficult

What changed:
- Added a mobile-only stacked row layout for the variable budget planner while preserving the existing desktop table for `sm` and larger screens
- Moved the category name to a dedicated wrapped text block so long category names are visible instead of truncated off-screen
- Reorganized the mobile row to show recommended amount, actual amount, remaining/overrun state, and budget input in a vertical layout that fits narrow screens
- Hid the desktop table header on mobile because the new stacked cards no longer rely on the four-column heading row

Files touched:
- `/src/components/monthly-summary/VariableBudgetPlanner.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Mobile-only UI improvement for the monthly summary budget planner; desktop/tablet layout remains unchanged

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

### 2026-03-12 - Made merchant-name edits inherit canonical categories and stop failing on partial propagation
Why:
- Renaming a malformed merchant like `אייזקסמעדניגורמה` to an existing canonical name like `אייזקס מעדני גורמה` still failed in some production cases
- Users also needed the corrected merchant to inherit the category that already exists on the canonical merchant family, not only avoid a duplicate-key block

What changed:
- Added canonical-category inheritance to transaction description edits when the new merchant name already exists on categorized transactions
- Broadened merge logic so exact duplicate conflicts keep the existing categorized row and attach the edited row to it
- Made similar-transaction propagation best-effort so one failing similar row no longer aborts the whole rename action
- Localized the generic server error for description edits so production toasts no longer show an English fallback message
- Updated the client-side state update so successful renames can also refresh inherited category data in the visible transaction list

Files touched:
- `/src/app/api/transactions/[id]/description/route.ts`
- `/src/components/transactions/TransactionList.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- Recommended to re-test long-press / right-click merchant rename on production after deploy

### 2026-03-12 - Added bulk delete for uncategorized transactions from the current transactions view
Why:
- Some malformed PDF imports produced many uncategorized rows, and editing each merchant manually was too slow
- Users needed a safe reset path to remove only the currently visible uncategorized transactions and re-upload corrected source files

What changed:
- Extended the bulk delete API with a new `uncategorized` mode that deletes only explicitly provided transaction IDs that still have no category
- Added a new transactions toolbar action, `מחק לא מסווגות`, which deletes uncategorized transactions from the current filtered view after confirmation
- Kept the deletion scoped to the visible filtered set instead of deleting all uncategorized rows system-wide, to reduce accidental data loss

Files touched:
- `/src/app/api/transactions/bulk-delete/route.ts`
- `/src/components/transactions/TransactionList.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- The new button appears only when uncategorized transactions exist

### 2026-03-12 - Added safe delete-by-upload flow on the uploads screen
Why:
- Deleting only uncategorized transactions was not enough when a problematic file had already created categorized duplicates or partially cleaned data
- Users needed a precise reset tool that removes one upload and only the transactions linked to that upload, so the same file can be re-imported cleanly without touching unrelated data

What changed:
- Added a dedicated `DELETE /api/upload/[id]` endpoint
- The endpoint deletes only transactions whose `fileUploadId` matches the selected upload, and only then deletes the upload record itself
- Revalidated upload, dashboard, transactions, monthly summary, recurring, and tips pages after deletion
- Reworked the recent uploads section into a client component with a `מחק העלאה` action per upload
- Added a confirmation modal that shows file name, source, account, upload time, and exact linked transaction count before deletion
- Added display of `transactionCount` per upload in the recent uploads list, alongside the original parsed row count

Files touched:
- `/src/app/api/upload/[id]/route.ts`
- `/src/components/upload/RecentUploadsList.tsx`
- `/src/app/upload/page.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- Upload deletion is now available from `/upload` and only affects transactions linked to the selected upload

### 2026-03-15 - Added current-period status card to the dashboard
Why:
- The dashboard already showed strong historical averages, but it still lacked a practical "right now" view for the active billing/calendar period
- Users need to know whether the current period is complete, how many days remain, and whether the current snapshot is missing bank or credit data before trusting the numbers

What changed:
- Added a new dashboard card for the active period with current income, expense, balance, daily burn rate, and remaining daily budget
- Added period progress metadata: active date range, total days, elapsed days, remaining days, and transaction count
- Added missing-source indicators that surface whether the current period is partial because it is missing expected `עו"ש` and/or `אשראי` data
- Kept the dashboard fault-tolerant by giving the new card its own server-side loader and fallback state, following the same pattern as the rest of the dashboard

Files touched:
- `/src/app/page.tsx`
- `/src/components/dashboard/CurrentPeriodStatusCard.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- Dashboard now performs one additional server-side transaction query to build current-period status

### 2026-03-15 - Added `לטיפול עכשיו` dashboard card for current-period follow-up
Why:
- After adding current-period status, the dashboard still lacked a focused area that translates the current snapshot into concrete actions
- Users need one place that surfaces what is blocking a reliable "this month" view: missing sources, uncategorized transactions, failed uploads, and active variable-budget alerts

What changed:
- Added a new dashboard card, `לטיפול עכשיו`, that summarizes open issues for the active billing/calendar period
- Surfaced four actionable states in one place:
  - missing required sources for the active period
  - uncategorized transactions in the active period
  - failed uploads from the last 14 days
  - active variable-budget alerts
- Added direct navigation from each card row to the relevant screen (`/upload`, `/transactions?categoryId=uncategorized`, `/monthly-summary`)
- Added a green empty state when there are no urgent follow-up items, so the dashboard clearly distinguishes "clean" periods from periods that still need work
- Kept the new card fault-tolerant with a server-side fallback builder so a problem in one action feed does not break the full dashboard

Files touched:
- `/src/app/page.tsx`
- `/src/components/dashboard/CurrentActionItemsCard.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- Dashboard now performs one additional server-side pass for uncategorized transaction count and failed upload count for the active period

### 2026-03-15 - Expanded variable budget status with end-of-period forecast
Why:
- The current-month dashboard still needed a forward-looking view, not just a snapshot of what already happened
- Users need to know whether the current variable-spend pace is likely to finish inside or outside the planned budget for the active billing/calendar period

What changed:
- Expanded the existing variable-budget dashboard card instead of adding another separate card
- Added end-of-period forecast metrics based on the actual spend pace so far in the active period
- Added projected total variable spend, projected gap versus plan, daily variable spend pace, and remaining daily allowance
- Added an on-track / warning / over status with a forecast banner so users can quickly understand whether the current pace is healthy
- Added projected utilization progress so the card compares both current usage and expected end-of-period usage
- Kept the calculation tied to the active billing/calendar period and current day count, so the forecast updates automatically as the period advances

Files touched:
- `/src/app/page.tsx`
- `/src/components/dashboard/VariableBudgetStatusCard.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- Dashboard variable-budget status now performs additional in-memory forecast calculations from already loaded current-period plan and spend data

### 2026-03-17 - Added Smart Nudges to the dashboard
Why:
- The dashboard already had current-period status and follow-up items, but it still needed a more proactive layer that warns before the user drifts into stale data or avoidable budget issues
- Users asked to make the system more "here and now", so the dashboard should surface timely nudges instead of waiting for manual inspection

What changed:
- Added a new `התראות חכמות` dashboard card that surfaces proactive current-period nudges
- Added nudges for partial current-period coverage when expected `עו"ש` or `אשראי` data is still missing
- Added nudges for stale uploads when no successful uploads were processed in the last 7 days
- Added nudges for recent failed uploads, uncategorized current-period transactions, and variable-budget pace risk
- Added a fault-tolerant server-side loader and fallback state so the dashboard keeps rendering even if one of the nudge queries fails

Files touched:
- `/src/app/page.tsx`
- `/src/components/dashboard/SmartNudgesCard.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No new environment variables
- Dashboard now performs one additional server-side pass for smart nudges based on upload freshness, failed uploads, uncategorized transactions, missing current-period sources, and variable-budget pace

### 2026-03-18 - Added one-week snooze for Smart Nudges
Why:
- Smart Nudges were useful, but users needed a way to dismiss a nudge temporarily without having it immediately reappear after refresh
- The snooze must persist per active period so a warning can be hidden for the current billing/calendar window without muting the same signal forever

What changed:
- Added persistent Smart Nudge snooze storage in `Setting` using a period-scoped key format
- Added a dashboard API route for reading and updating snoozed Smart Nudges without adding a migration
- Updated Smart Nudge loading on the dashboard so nudges are filtered server-side when their period-scoped snooze is still active
- Added a new `השהה לשבוע` action inside the Smart Nudges card, with immediate client-side removal and toast feedback after success
- Kept expired snoozes self-cleaning so the stored payload stays compact and old dismissals do not accumulate

Files touched:
- `/src/lib/smart-nudge-snooze.ts`
- `/src/app/api/dashboard/smart-nudges-snooze/route.ts`
- `/src/app/page.tsx`
- `/src/components/dashboard/SmartNudgesCard.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No new environment variables
- Dashboard now performs one additional `Setting` lookup to filter active Smart Nudges by snooze state

### 2026-03-18 - Added persistent dismiss for Smart Nudges
Why:
- A one-week snooze was useful, but users also needed a stronger “handled for this period” action so accepted nudges do not come back again after refresh during the same billing/calendar window
- Some dashboard nudges are informational once acknowledged, so hiding them only for seven days was still too noisy

What changed:
- Added persistent dismissed Smart Nudge storage in `Setting` using the same period-scoped key format as snoozes
- Extended the Smart Nudge state API to support `dismiss`, `clear`, and combined snooze/dismiss normalization
- Updated dashboard loading so both snoozed and dismissed nudges are filtered server-side before render
- Added a new `סגור לתקופה` action in the Smart Nudges card, with immediate client-side removal and toast feedback

Files touched:
- `/src/lib/smart-nudge-snooze.ts`
- `/src/app/api/dashboard/smart-nudges-snooze/route.ts`
- `/src/app/page.tsx`
- `/src/components/dashboard/SmartNudgesCard.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No new environment variables
- Dashboard now performs one additional `Setting` lookup for dismissed Smart Nudges alongside the existing snooze-state lookup

### 2026-03-18 - Added direct recurring removal via repeat icon and clearer mobile bottom-nav labels
Why:
- On mobile, removing an item from fixed expenses was hard to discover because the only remove button depended on desktop hover behavior
- The short mobile bottom-nav labels were too vague and made it hard to understand the destination of each tab at a glance

What changed:
- Changed recurring-expense rows so the blue repeat icon itself now removes the item from fixed expenses
- Removed the hidden hover-only `X` action from recurring rows, since the repeat icon now serves as the single clear removal affordance
- Expanded mobile bottom-nav labels to `לוח בקרה`, `סיכום חודשי`, and `הוצאות קבועות`
- Updated the bottom-nav item layout to support two-line labels cleanly on mobile

Files touched:
- `/src/components/recurring/RecurringExpensesList.tsx`
- `/src/components/Sidebar.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No new environment variables
- Mobile recurring removal now happens directly from the repeat icon, and the bottom navigation uses taller wrapped labels

### 2026-03-18 - Polished current month control center wording and action clarity
Why:
- The first version of the current month control center exposed the right data, but the wording still felt a bit raw and ambiguous in a few important places
- Users needed clearer guidance about whether the current period is complete, what `מאזן עד כה` means, and what each `לטיפול עכשיו` action will actually do

What changed:
- Added explicit data-quality status chips to the current-period card so the dashboard now distinguishes between waiting for data, partial data, and complete data
- Clarified key dashboard labels such as `מאזן עד כה`, `מרווח עד סוף התקופה לפי המצב הנוכחי`, `הוצאות בפועל`, `מרווח נותר`, and `ניצול עד כה`
- Rewrote helper and empty-state copy across the current-period, action-items, and variable-budget cards so the guidance is more operational and less generic
- Replaced the generic `פתח` CTA in `לטיפול עכשיו` with task-specific labels such as `השלם נתונים`, `בדוק העלאות`, `בדוק תקציב`, and `שייך תנועות`

Files touched:
- `/src/components/dashboard/CurrentPeriodStatusCard.tsx`
- `/src/components/dashboard/CurrentActionItemsCard.tsx`
- `/src/components/dashboard/VariableBudgetStatusCard.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No new environment variables
- Dashboard polish only; no data model or background-job impact

### 2026-03-18 - Fixed merchant rename collisions by preflighting duplicate merges
Why:
- Merchant names that were parsed without spaces, such as `אייזקסמעדניגורמה`, still failed to rename into their canonical spaced form when a matching transaction already existed
- The previous flow relied on catching a database unique-constraint error inside the same transaction, which could leave the rename request in a failed state and surface a generic error toast instead of merging into the existing canonical row

What changed:
- Changed the merchant-rename API to check for an existing conflicting transaction before attempting the update, and merge into that canonical row immediately when found
- Preserved the existing category inheritance behavior while avoiding the failing `update -> P2002 -> recover` path for the common compacted-name fix flow
- Added a clearer user-facing error message for the rare race-condition case where another duplicate is created between the preflight check and the actual write

Files touched:
- `/src/app/api/transactions/[id]/description/route.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No new environment variables
- Merchant renames that target an already-existing canonical description should now merge cleanly instead of failing on the unique transaction constraint

### 2026-03-19 - Prioritized learned merchant history before broad auto-categorization rules and AI
Why:
- Known merchants such as `אייזיקס` and `ניצת הדובדבן` were occasionally drifting into the wrong category on fresh uploads, even though previous months had already taught the system they belong under `סופר`
- The old categorization order let broader substring matches and AI suggestions override a stronger merchant-history signal, which reduced trust in recurring month-over-month categorization

What changed:
- Kept exact keyword matches as the first and strongest categorization signal
- Moved learned merchant-history matching ahead of broad `contains` keyword rules inside the shared keyword categorizer, so previously learned merchants now win before generic text patterns
- Updated bulk auto-categorization to first classify descriptions locally using keywords and learned merchant history, and only send unresolved descriptions to AI
- Updated single-transaction auto-categorization to use the same precedence order and report whether the result came from `history`, `keywords`, or `ai`
- Reduced unnecessary AI calls for descriptions the system already understands confidently from prior categorized history

Files touched:
- `/src/services/categorization/KeywordCategorizer.ts`
- `/src/app/api/transactions/auto-categorize/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No new environment variables
- Upload-time categorization and both AI categorization flows now prefer learned merchant history over broad generic rules
- AI usage should decrease slightly because already-learned merchants are resolved before being sent to the model

### 2026-03-19 - Made learned merchant history choose the dominant category per merchant
Why:
- Some merchants that clearly belong to one recurring category, such as `אייזיקס` and `ניצת הדובדבן`, still drifted into the wrong category on fresh uploads
- The previous historical-learning logic kept multiple category candidates for the same merchant if that merchant had ever been categorized inconsistently, which let a single bad historical row outweigh the real long-term pattern

What changed:
- Changed historical merchant learning to group categorized transactions by normalized merchant text instead of keeping separate historical candidates per `merchant + category`
- Added dominant-category selection per merchant, so only the strongest recurring category survives into the learned-history matcher
- Marked mixed-history merchants as ambiguous and skipped them from learned-history matching instead of confidently choosing a weak signal
- Added a small confidence boost for merchants that appeared multiple times in the same category, which helps stable recurring merchants win over generic broad keyword rules

Files touched:
- `/src/services/categorization/KeywordCategorizer.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- No new environment variables
- Fresh upload-time categorization should now be more consistent for repeat merchants that occasionally had one-off wrong historical categorization
