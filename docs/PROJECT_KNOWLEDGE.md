# Family Finance - Project Knowledge

Last updated: 2026-05-17

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
- `MOBILE_APP_API_TOKEN` (optional, required if the mobile receipts app should access `/api/receipts*` without a browser session cookie)
- `RECEIPT_IMAGE_STORAGE_BACKEND` (optional, `local` by default; set to `supabase` to move receipt images off the app server)
- `RECEIPT_IMAGE_CLEANUP_SECRET` (optional, required if cleanup should be triggered via protected HTTP route)
- `RECEIPT_IMAGE_RETENTION_DAYS` (optional, defaults to `45` for receipt-image cleanup)
- `AUTH_USERNAME`
- `AUTH_PASSWORD_SHA256`
- `AUTH_COOKIE_TOKEN`
- `SUPABASE_URL` (optional if `SUPABASE_PROJECT_REF` is set; required for receipt-image storage when project ref is not available)
- `SUPABASE_SERVICE_ROLE_KEY` (optional for the main app, required when receipt-image storage backend is `supabase`)
- `SUPABASE_RECEIPTS_BUCKET` (optional for the main app, required when receipt-image storage backend is `supabase`)
- `SUPABASE_PROJECT_REF` (optional, for auto-recovery)
- `SUPABASE_MANAGEMENT_TOKEN` (optional, for auto-recovery)

## Recent changes

### 2026-05-17 - Telegram upload account-resolution fix
Why:
- Telegram document uploads could fail even when the same bank/card files worked through the web uploader
- The Telegram flow resolved accounts differently from `/api/upload`, which could trigger account unique-constraint failures for existing bank and card accounts
- Build verification for the Telegram fix also exposed a small root-level TypeScript regression that had to be cleared before safe deploy

What changed:
- Added a shared import-account resolver for bank/card uploads
- Reused the shared resolver in both the web upload route and the Telegram bot upload flow
- Added explicit Telegram file-download status validation and richer upload-error logging context
- Fixed a root `page.tsx` `implicit any` so production build verification can complete cleanly again

Files touched:
- `/src/lib/import-accounts.ts`
- `/src/app/api/upload/route.ts`
- `/src/services/telegram/TelegramBotService.ts`
- `/page.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy
- No DB migration
- Telegram uploads now reuse the same account matching/creation logic as the web uploader, reducing false failures on existing accounts

## Current product behavior (canonical)

### Authentication and access control
- App is protected behind login (`/login`)
- Middleware enforces auth for pages and APIs except explicit public routes
- Login supports `remember me`
- Brute-force protection exists (IP-based rate limiting)
- The future mobile receipts app can be authorized separately with `MOBILE_APP_API_TOKEN`, but only for `/api/receipts*` routes; the rest of the product still requires the normal web session

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

### Receipt capture backend
- Receipt image upload keeps using the same `POST /api/receipts/:id/image` flow, but now stores an optimized primary image plus a lightweight thumbnail
- Receipt image retrieval is available via `GET /api/receipts/:id/image` with optional `?variant=thumbnail`
- Receipt review can now be closed via `POST /api/receipts/:id/complete-review`, which marks the receipt `COMPLETED` and confirms any still-unreviewed items
- Receipt image storage supports:
  - `local` filesystem keys under `runtime-data/receipts/...`
  - `supabase` object keys under `supabase://<bucket>/receipts/...`
- Cleanup flows remove both the primary receipt image and the thumbnail based on the stored key prefix

### Telegram integration
- Telegram bot supports upload webhook flow for supported finance files
- Production access is restricted by `TELEGRAM_ALLOWED_CHAT_IDS`
- If `TELEGRAM_ALLOWED_CHAT_IDS` is missing in production, the bot rejects all chats and returns the current `chat_id` for configuration
- In non-production, missing `TELEGRAM_ALLOWED_CHAT_IDS` falls back to open access for local testing
- Telegram action-surface commands now include:
  - `/month` for the current-period snapshot
  - `/missing` for current-period missing sources
  - `/uncategorized` for current-period uncategorized transactions
  - `/budget` for variable-budget status
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
- Telegram reminders now send the active Smart Nudges themselves, with action buttons that match the dashboard links
- High-priority Smart Nudges such as budget overruns or repeated failed uploads can now trigger Telegram reminders even outside the older reminder checkbox set
- Telegram Smart Nudge reminder buttons now support `השהה לשבוע` and `סגור לתקופה` directly from the Telegram message, using the same shared nudge-state storage as the dashboard

### Dashboard
- Presents generalized monthly picture (averages, not just current month totals)
- Uses complete periods for averages where possible
- Partial data periods are excluded from average basis and indicated
- Fault tolerance added so partial datasource failures do not crash full dashboard
- Charts render left-to-right for timeline clarity
- Smart Nudges now escalate repeated issues across recent periods instead of treating every alert as isolated
- Smart Nudges now use more action-oriented wording and action labels for missing sources, stale uploads, uncategorized transactions, failed uploads, and variable-budget pace risk

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
- Receipt-focused mobile app planning:
  - `/docs/RECEIPTS_MOBILE_APP_PLAN.md`

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

### If receipt images start consuming too much storage
- Receipt images can be stored in one of two backends:
  - `local` -> `runtime-data/receipts/<receiptId>/...`
  - `supabase` -> `supabase://<bucket>/receipts/<receiptId>/...`
- Recommended production setup:
  - `RECEIPT_IMAGE_STORAGE_BACKEND=supabase`
  - `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
  - `SUPABASE_RECEIPTS_BUCKET=<bucket-name>`
- Manual dry-run cleanup:
  - `npm run receipts:cleanup -- --dry-run`
- Manual destructive cleanup:
  - `npm run receipts:cleanup`
- Cron/API cleanup trigger:
  - `POST /api/receipts/image-cleanup/run`
  - header: `x-receipt-image-cleanup-secret: <RECEIPT_IMAGE_CLEANUP_SECRET>`
- Optional query params for the API route:
  - `dryRun=true`
  - `retentionDays=<number>`
- Default cleanup behavior:
  - only receipts in `COMPLETED` / `FAILED`
  - only when older than `RECEIPT_IMAGE_RETENTION_DAYS` (default `45`)
  - clears `imageStorageKey` / `thumbnailStorageKey` after deletion
  - removes either local files or Supabase Storage objects based on the stored key prefix

## Consolidated change log (major milestones)

### 2026-03-31 - Added receipt review completion endpoint
Why:
- The mobile app can already capture and reopen receipts, but it still lacked a clean backend action to finish a receipt-review flow
- Before building history and repeated review usage on mobile, the backend needed a single way to mark a receipt as handled without manually patching the status field

What changed:
- Added `POST /api/receipts/:id/complete-review`
- Added backend helper logic that marks any still-`UNREVIEWED` receipt items as `CONFIRMED`
- Finalizing review now also moves the receipt itself to `COMPLETED` and clears `parseError`
- Documented the new review-closing behavior in project knowledge

Files touched:
- `/src/lib/receipts.ts`
- `/src/app/api/receipts/[id]/complete-review/route.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- No DB migration
- No new environment variables
- Mobile and future web receipt-review flows now have a dedicated completion action instead of overloading the generic receipt `PATCH`

### 2026-03-31 - Added receipt image retrieval endpoint for mobile review flows
Why:
- The mobile app could show a freshly captured local preview, but it still had no reliable way to reopen a saved receipt image later from the backend
- Before adding receipt history and deeper review screens, the backend needed a single image route that works for both local and Supabase-backed storage

What changed:
- Added receipt-image loading support to the storage layer for both local filesystem keys and Supabase object keys
- Extended `GET /api/receipts/:id/image` so clients can fetch either the main receipt image or `?variant=thumbnail`
- Kept the route behind the existing receipts auth path, so the future mobile app can reuse the same mobile-token flow instead of depending on public image URLs
- Documented the new retrieval capability in project knowledge

Files touched:
- `/src/lib/receipt-image-storage.ts`
- `/src/app/api/receipts/[id]/image/route.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- No DB migration
- No new environment variables
- Receipt review clients can now reopen saved receipt images through the backend even when the original local preview is gone
- The route works with both `local` and `supabase` storage backends

### 2026-03-31 - Added dedicated mobile token auth for receipt APIs
Why:
- The cross-platform receipts app cannot rely on the browser cookie session used by the web dashboard
- Before any real iPhone/Android beta can talk to production, the backend needs a dedicated auth path that stays narrowly scoped and does not weaken the rest of the site

What changed:
- Added `MOBILE_APP_API_TOKEN` support in the shared auth layer
- Updated middleware so `/api/receipts*` routes can be accessed with the mobile token header or bearer token, while the rest of the product still requires the normal session cookie
- Kept the protected cleanup route excluded from mobile-token access so operational cleanup remains separately protected
- Documented the new env and runtime behavior for the mobile receipts app

Files touched:
- `/src/lib/auth.ts`
- `/src/middleware.ts`
- `/.env.example`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- New optional env: `MOBILE_APP_API_TOKEN`
- No DB migration
- No existing web auth flow changes
- Mobile receipt clients can authenticate against `/api/receipts*` using either:
  - `x-mobile-api-token: <MOBILE_APP_API_TOKEN>`
  - `Authorization: Bearer <MOBILE_APP_API_TOKEN>`

### 2026-03-31 - Added optimized receipt image uploads with thumbnails
Why:
- Moving receipt images to object storage solved the server-disk risk, but mobile capture still needed lighter files so uploads stay fast and storage costs stay controlled
- Before real iPhone/Android beta usage, the receipt upload flow needed a consistent optimized asset plus a smaller preview asset for future review screens

What changed:
- Added server-side receipt-image optimization using `sharp` so uploaded receipt images are normalized into a lighter JPEG before storage
- Added thumbnail generation during `POST /api/receipts/:id/image`, and the receipt record now stores both `imageStorageKey` and `thumbnailStorageKey`
- Kept a safe fallback path so if image optimization fails for a specific image, the upload still stores the original file instead of failing the whole capture flow
- Updated project knowledge to document the optimized primary-image plus thumbnail behavior

Files touched:
- `/src/lib/receipt-image-storage.ts`
- `/src/app/api/receipts/[id]/image/route.ts`
- `/package.json`
- `/package-lock.json`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- New optional dependency: `sharp`
- No DB migration
- Existing receipt upload API contract stays the same, but uploads now usually produce:
  - one optimized primary image
  - one thumbnail image
- Cleanup already covers both keys, so no new operational cleanup flow is required

### 2026-03-31 - Added Supabase-backed receipt image storage adapter
Why:
- Receipt-image upload and cleanup flows were already working, but they still relied on app-server filesystem storage as the primary persistence layer
- Before enabling real receipt capture in production, the image pipeline needed a clean way to move originals off the main server while keeping the same API contract for the future mobile app

What changed:
- Added an adapter-based receipt-image storage layer that keeps `local` storage as the default but can switch to `supabase` with environment configuration
- Added Supabase Storage upload support for `POST /api/receipts/:id/image` while preserving the existing receipt image response shape and storage-key field usage
- Extended receipt-image cleanup so it can delete either local files or Supabase Storage objects based on the stored image-key prefix
- Documented the new runtime configuration, recommended production setup, and storage-specific cleanup behavior

Files touched:
- `/src/lib/receipt-image-storage.ts`
- `/src/lib/receipt-image-cleanup.ts`
- `/package.json`
- `/package-lock.json`
- `/.env.example`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- New optional dependency: `@supabase/supabase-js`
- No DB migration
- Existing behavior stays `local` by default, so deploys stay backward-compatible if no new env vars are added
- To move receipt images off the server, production must set:
  - `RECEIPT_IMAGE_STORAGE_BACKEND=supabase`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_RECEIPTS_BUCKET`
  - either `SUPABASE_URL` or `SUPABASE_PROJECT_REF`
- Cleanup scripts and the protected cleanup route now remove remote objects as well as local files

### 2026-03-30 - Added receipt-image cleanup flow to control server disk usage
Why:
- Even before moving to object storage, receipt-image uploads needed a retention strategy so the app server would not slowly fill up with old originals
- The most important immediate risk reduction was giving the project a safe cleanup flow that can run manually or from cron without affecting the existing finance product

What changed:
- Added receipt-image cleanup helpers that find old receipt images for `COMPLETED` / `FAILED` receipts, delete the files, and clear the stored image keys from the receipt records
- Added a protected cleanup API route at `POST /api/receipts/image-cleanup/run` using `RECEIPT_IMAGE_CLEANUP_SECRET`
- Added a manual cleanup script plus `npm run receipts:cleanup` for dry runs and server-side execution
- Documented the retention defaults and operational runbook for controlling disk usage until object storage replaces server-local receipt images

Files touched:
- `/src/lib/receipt-image-storage.ts`
- `/src/lib/receipt-image-cleanup.ts`
- `/src/app/api/receipts/image-cleanup/run/route.ts`
- `/scripts/cleanupReceiptImages.ts`
- `/package.json`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- New optional env keys:
  - `RECEIPT_IMAGE_CLEANUP_SECRET`
  - `RECEIPT_IMAGE_RETENTION_DAYS`
- Cleanup is safe to introduce without changing any current dashboard or transactions flow
- The route and script only touch receipt-image files and receipt image-key fields
- This is still an interim filesystem-based retention solution until receipt images move to object storage

### 2026-03-30 - Added receipt image upload endpoint for the mobile capture flow
Why:
- The mobile receipt app now needs more than a draft-record API; it needs a real way to attach the captured receipt image immediately after checkout
- A separate image-upload step keeps the flow fast and safe: create the receipt draft first, upload the image second, and leave OCR/review for the next step

What changed:
- Added a dedicated receipt-image storage helper that validates uploaded image files and saves them under a runtime receipt-image directory on the server
- Added `POST /api/receipts/:id/image` to attach a captured image to an existing receipt draft and update the receipt status to `PROCESSING`
- Kept image upload separated from OCR so the future mobile app can capture first and enrich/process later without blocking the user in the supermarket

Files touched:
- `/src/lib/receipt-image-storage.ts`
- `/src/app/api/receipts/[id]/image/route.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Receipt images are currently stored on the app server filesystem under `runtime-data/receipts/<receiptId>/...`, so server disk persistence matters until object storage is introduced
- The receipt-domain Prisma migration is still required before the endpoint can be used
- No existing dashboard or transaction pages depend on this route yet, so the current site should keep behaving the same after deploy

### 2026-03-30 - Expanded receipts backend for item review and processing flows
Why:
- The first receipts API skeleton was enough for draft receipt creation, but the future mobile app also needs dedicated endpoints for OCR/process updates and line-item review flows
- Keeping those flows in separate endpoints makes the mobile app faster and cleaner: capture first, then process metadata, then review or edit line items

What changed:
- Added receipt-item parsing and persistence helpers so receipt line items can now be listed, created in bulk, and updated individually
- Added `GET /api/receipts/:id/items` and `POST /api/receipts/:id/items` for retrieving and creating receipt line items
- Added `PATCH /api/receipts/:id/items/:itemId` for editing a single line item during review
- Added `POST /api/receipts/:id/process` as a lightweight processing endpoint that updates receipt OCR/parser metadata and automatically derives a sensible next status (`NEEDS_REVIEW` or `FAILED`) when the client does not send one
- Kept all new receipt endpoints isolated from the existing transaction ingestion and categorization flows

Files touched:
- `/src/lib/receipts.ts`
- `/src/app/api/receipts/[id]/items/route.ts`
- `/src/app/api/receipts/[id]/items/[itemId]/route.ts`
- `/src/app/api/receipts/[id]/process/route.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- The receipt-domain Prisma migration still has to be applied before these endpoints can be used in production
- No existing dashboard or transactions UI depends on these new endpoints yet, so the current site should behave the same after deploy
- These endpoints complete the backend skeleton needed for a camera-first cross-platform receipts app to start integrating safely

### 2026-03-29 - Added initial receipts API skeleton for mobile/backend integration
Why:
- After defining the dedicated receipt-domain schema, the next step was exposing a clean backend surface the future mobile app can talk to without touching the current bank/card transaction flows
- The first receipt APIs needed to stay useful even before OCR and image upload flows exist, so the backend can already create, list, inspect, and edit receipt drafts

What changed:
- Added a dedicated receipts helper layer with typed request parsing, raw-SQL persistence helpers, store resolution, and safe error handling around the new receipt-domain tables
- Added `GET /api/receipts` and `POST /api/receipts` for listing existing receipt drafts and creating new receipt records
- Added `GET /api/receipts/:id` and `PATCH /api/receipts/:id` for receipt detail views and metadata updates such as status, store, totals, notes, OCR text, and parser fields
- Added explicit runtime handling for environments where the receipt Prisma migration has not been applied yet, returning a clean `503` instead of a generic server crash
- Kept the new API intentionally isolated from the existing transaction upload/categorization APIs so the future cross-platform mobile app can evolve as its own receipt domain

Files touched:
- `/src/lib/receipts.ts`
- `/src/app/api/receipts/route.ts`
- `/src/app/api/receipts/[id]/route.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- The receipt-domain migration must be applied before these endpoints can be used in production
- No current web UI routes depend on these endpoints yet, so there is no visible change in the existing dashboard or transactions pages
- No new environment variables were added
- These endpoints are the backend foundation for the future iPhone/Android receipt-capture app and review flow

### 2026-03-29 - Added initial receipt-domain Prisma schema foundation
Why:
- The receipts mobile app should stay separated from the existing transaction flows, but still connect cleanly to the same backend over time
- Before building receipt APIs or an iPhone app, the backend needed a dedicated data model for receipts, products, stores, and price history instead of overloading the current `Transaction` schema

What changed:
- Added initial Prisma models for `Receipt`, `ReceiptItem`, `Store`, `Product`, `ProductAlias`, and `PriceObservation`
- Added supporting enums for receipt processing state, receipt-item review state, and product-alias source
- Added a SQL migration that creates the new receipt-domain tables, indexes, and foreign keys while keeping them isolated from the current transaction ingestion pipeline
- Kept the new schema intentionally separate from bank/card transactions so receipt capture can evolve as its own mobile-first domain

Files touched:
- `/prisma/schema.prisma`
- `/prisma/migrations/20260329123000_add_receipts_domain/migration.sql`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Applying the new Prisma migration is required before any future receipt APIs or mobile receipt flows can be enabled
- No current user-facing web flow changes yet
- No new environment variables yet
- The existing transaction upload and categorization runtime are unchanged

### 2026-03-29 - Added Telegram snooze and dismiss actions for Smart Nudges
Why:
- Once Smart Nudges started reaching Telegram, the next friction point was that they were still read-only there
- The dashboard already had snooze and dismiss behavior, so Telegram needed the same loop-closing actions instead of forcing the user back into the web UI

What changed:
- Added shared Smart Nudge state persistence helpers so the dashboard API and Telegram bot both update the same snoozed and dismissed state
- Extended Telegram reminder keyboards with `השהה לשבוע` and `סגור לתקופה` callback buttons for active Smart Nudges
- Added Telegram callback handling so Smart Nudges can now be snoozed or dismissed directly from the bot without opening the site
- Updated `/settings` copy to explain that Telegram reminders now support in-message handling actions

Files touched:
- `/src/lib/smart-nudge-snooze.ts`
- `/src/lib/telegram-smart-nudge-actions.ts`
- `/src/lib/telegram-reminders.ts`
- `/src/services/telegram/TelegramBotService.ts`
- `/src/app/api/dashboard/smart-nudges-snooze/route.ts`
- `/src/app/settings/page.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Telegram Smart Nudge callback actions now write into the same persisted snooze/dismiss state that the dashboard reads, so snoozed or dismissed reminders stay suppressed across both surfaces
- Reminder messages can now trigger Telegraf callback handling in addition to normal deep-link navigation

### 2026-03-29 - Connected Smart Nudges to Telegram reminders
Why:
- Smart Nudges had become the clearest prioritization layer in the dashboard, but Telegram reminders were still built from older standalone rules
- Without a shared engine, the dashboard and Telegram risked drifting and surfacing different priorities for the same period

What changed:
- Extracted the Smart Nudges engine into a shared server-side helper so the dashboard and Telegram use the same priority, recurrence, and wording logic
- Changed Telegram reminders to send the active Smart Nudges themselves, including direct action buttons based on the nudge links
- Upgraded reminder triggering so high-priority Smart Nudges such as variable-budget overruns or repeated failed uploads can trigger delivery even when they are outside the older reminder checkbox set
- Updated `/settings` copy so the reminder behavior now explains that high-priority Smart Nudges may also trigger a Telegram send

Files touched:
- `/src/lib/smart-nudge-types.ts`
- `/src/lib/smart-nudges.ts`
- `/src/app/page.tsx`
- `/src/components/dashboard/SmartNudgesCard.tsx`
- `/src/lib/telegram-reminders.ts`
- `/src/app/settings/page.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Telegram reminder runs now execute the shared Smart Nudges engine before sending, so reminder content and dashboard priorities stay aligned
- Weekly reminders may now fire for high-priority Smart Nudges even when they are not covered by the legacy reminder checkboxes

### 2026-03-26 - Escalated recurring Smart Nudges and made actions more explicit
Why:
- The next Smart Nudges phase was to stop treating every issue as a one-off and instead surface when the same problem keeps coming back across recent periods
- Existing nudges were helpful, but some of them still sounded observational instead of telling the user what to do next

What changed:
- Added recent-period Smart Nudge issue tracking for missing sources and uncategorized transactions so the dashboard can detect when the same issue repeats across consecutive periods
- Upgraded Smart Nudges to raise priority and tone when missing-source or uncategorized problems recur, including explicit recurrence labels such as repeated-period warnings
- Rewrote action labels and descriptions to be more operational, for example telling the user to upload a specific missing source, open failed uploads, or review the variable-budget forecast directly
- Added stronger stale-upload messaging based on how many days have passed since the last successful upload

Files touched:
- `/src/app/page.tsx`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Smart Nudges now do one additional recent-period transaction pass and one latest-successful-upload lookup so recurring operational issues can be escalated more clearly in the dashboard

### 2026-03-26 - Added Telegram action-surface commands for current-period monitoring
Why:
- The next planned Telegram step was to let the user operate common read-only flows from mobile without opening the site
- Current-month status, missing data, uncategorized transactions, and variable-budget pressure already existed in the app, but not as fast Telegram commands

What changed:
- Added a shared current-period insights helper that calculates the active period snapshot, uncategorized preview, recent upload count, and variable-budget status for Telegram use
- Extended the Telegram bot with `/month`, `/missing`, `/uncategorized`, and `/budget` commands
- Updated `/start` and `/help` so the bot now advertises the new action-surface commands and returns deep links into the relevant screens

Files touched:
- `/src/lib/current-period-insights.ts`
- `/src/services/telegram/TelegramBotService.ts`
- `/docs/PROJECT_KNOWLEDGE.md`

Deploy/runtime impact:
- Normal deploy required
- No DB migration
- No new environment variables
- Telegram users can now inspect the current period, missing sources, uncategorized transactions, and variable-budget pressure directly from the bot

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
