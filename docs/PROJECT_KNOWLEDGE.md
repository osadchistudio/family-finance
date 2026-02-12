# Family Finance - Project Knowledge

Last updated: 2026-02-12

## Stack
- Next.js 16.1.6 (App Router, standalone output)
- Tailwind CSS v4 via `@tailwindcss/postcss`
- Prisma 7 + PostgreSQL (Supabase)
- PM2 process: `family-finance`

## Production deployment (DigitalOcean)
- Server path: `/root/family-finance`
- Domain: `https://osadchi-systems.com`
- Build command must use:
  - `NODE_OPTIONS="--dns-result-order=ipv4first" npm run build`
- Standalone copy steps are required:
  - `mkdir -p .next/standalone/.next/static`
  - `cp -r .next/static/* .next/standalone/.next/static/`
  - `cp -r public .next/standalone/public`
  - `cp .env .next/standalone/.env`

## Critical config files
- `/postcss.config.mjs` (required for Tailwind v4 CSS build)
- `/prisma.config.ts` (required so Prisma 7 resolves schema path)

## Behavior updates

### 2026-02-12 - Search clear button + AI button visible on every transaction row
Why:
- Users needed one-click clearing of search input without selecting text manually.
- Users expected to see per-transaction AI categorization action on every row.

What changed:
- Added inline `X` clear control in the transactions search input to reset search immediately.
- Per-row AI categorization button now appears for all rows in the actions column (not only uncategorized rows).
- Single-transaction AI endpoint now allows re-checking categorized rows; when AI returns same category, it returns an informative no-change message.

Files touched:
- `/src/components/transactions/TransactionList.tsx`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Category change now auto-propagates to identical transactions
Why:
- Users wanted a manual category fix on one transaction to update all identical merchant transactions automatically.

What changed:
- Category update API now always propagates the selected category to all transactions with the same description (case-insensitive), excluding the edited row itself.
- Propagation is independent of the "learn from this assignment" checkbox.
- "Learn" still controls keyword learning for future imports; propagation handles existing identical rows immediately.
- Transactions UI local state now mirrors this propagation instantly after category change.

Files touched:
- `/src/app/api/transactions/[id]/category/route.ts`
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Per-transaction AI auto-categorization action
Why:
- Users needed to run AI categorization on a single uncategorized transaction without triggering the global "categorize all" action.

What changed:
- Added a new API endpoint for single-transaction AI categorization:
  - `/api/transactions/[id]/auto-categorize`
- Added a per-row AI button (magic wand) in transactions table actions for uncategorized rows only.
- On success, the row updates immediately with assigned category and `isAutoCategorized=true`.
- Shared AI categorization logic moved to:
  - `/src/lib/autoCategorize.ts`
  and reused by both global and single-item flows.

Files touched:
- `/src/lib/autoCategorize.ts`
- `/src/app/api/transactions/auto-categorize/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Numeric search now matches both income and expense amounts
Why:
- Numeric search previously matched only expenses and missed matching income rows with the same amount.

What changed:
- Transactions numeric search now matches by absolute amount for both expenses and incomes.
- Existing rounded-display matching behavior remains (whole-number search matches rounded UI value).

Files touched:
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Remove consolidated-card bulk delete button from transactions UI
Why:
- After one-time cleanup, the extra bulk-delete button was no longer needed and took space in the filters row.
- Automatic filtering on future bank uploads remains the primary protection against duplicates.

What changed:
- Removed the "מחק חיובי אשראי מרוכזים" button and its client-side handler from the transactions page.
- Kept regular per-transaction delete action unchanged.

Files touched:
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Viewport-safe icon picker + income/expense filter in transactions
Why:
- Category icon dropdown could overflow outside the viewport near screen edges.
- Needed an explicit transaction filter to show only expenses or only income.

What changed:
- Category icon picker now renders in a portal with fixed positioning and dynamic viewport clamping (opens with safe top/left/height and repositions on resize/scroll).
- Added close behavior by backdrop click and `Escape` key for icon picker.
- Transactions page now includes a new amount-type filter: all / only expenses / only income.

Files touched:
- `/src/app/categories/page.tsx`
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Category sync fix + searchable extended icon picker
Why:
- Newly created categories could be missing in transaction assignment dropdown due stale category data/caching.
- Category icon picker was too limited and lacked search.

What changed:
- Transactions page now refreshes categories from API (including on window focus) so new categories appear in assignment dropdown without waiting for a full deploy cycle.
- Category API and transactions page were switched to dynamic rendering behavior to prevent stale category snapshots.
- Category icon picker now includes an extended icon set, text search by label/keywords, and manual icon input.

Files touched:
- `/src/components/transactions/TransactionList.tsx`
- `/src/app/api/categories/route.ts`
- `/src/app/transactions/page.tsx`
- `/src/app/categories/page.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Search by displayed expense amount + transaction deletion tools
Why:
- Amount search did not match what users see in UI when values are rounded (example: `262.27` displayed as `₪262`).
- Needed practical cleanup for already imported duplicated credit-card charges from bank statements.

What changed:
- Amount search now matches displayed rounded expenses when searching with whole numbers (for example searching `262` matches an expense displayed as `₪262`).
- Added single transaction deletion from transactions list.
- Added bulk cleanup action: delete consolidated credit-card charge lines from bank-account transactions, scoped by selected account and month filters.

Files touched:
- `/src/components/transactions/TransactionList.tsx`
- `/src/app/api/transactions/[id]/route.ts`
- `/src/app/api/transactions/bulk-delete/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- Bulk delete is irreversible and removes DB rows physically (not soft-delete).

### 2026-02-12 - Search by expense amount + skip consolidated card charge lines
Why:
- Needed to search transactions by amount (not only text).
- Needed to avoid double counting when bank current-account statements include a consolidated credit-card charge (example: "מסטרקרד - 19,372") while credit-card details are already uploaded separately.

What changed:
- Transaction search now supports numeric amount queries and matches expenses by absolute amount.
- Parser now ignores consolidated card-charge debit rows in bank statement imports.

Files touched:
- `/src/components/transactions/TransactionList.tsx`
- `/src/services/parsers/FileParserService.ts`
- `/src/services/parsers/BankHapoalimPdfParser.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- Existing old rows in DB are unchanged; this affects new imports and search behavior.

### 2026-02-12 - Restore production styling and Prisma config compatibility
Why:
- Production UI appeared unstyled when Tailwind postcss config was missing.
- Prisma 7 schema resolution required explicit config.

What changed:
- Added missing PostCSS config for Tailwind v4.
- Added missing Prisma config file.

Files touched:
- `/postcss.config.mjs`
- `/prisma.config.ts`

Deploy/runtime impact:
- Full rebuild required in production.
- No DB migration needed.
