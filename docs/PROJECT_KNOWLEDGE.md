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
