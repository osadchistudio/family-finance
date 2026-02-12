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

