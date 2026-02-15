# Family Finance - Project Knowledge

Last updated: 2026-02-14

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

### 2026-02-14 - Monthly summary category trend switched to dropdown multi-select + explicit all-months average context
Why:
- Category selection UI needed to be a dropdown multi-select (instead of always-open checkbox list) for cleaner UX.
- Users needed clear visibility that the category section reflects cross-period monthly averages, aligned with top summary cards logic.

What changed:
- Replaced open checkbox grid with dropdown multi-select (up to 5 categories) in monthly category trend section.
- Dropdown now shows each category with its monthly average across all months, and supports quick clear/reset to total expenses.
- Added explicit summary line in the section:
  - no category selection: average monthly total expense across all months
  - with selected categories: combined average monthly amount across selected categories.
- Retained per-selected-category average cards and renamed heading to emphasize full-period average.

Files touched:
- `/src/components/monthly-summary/CategoryExpenseTrendChart.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-14 - Dashboard category percentages aligned between top pie summary and lower averages list
Why:
- Dashboard showed different percentages for the same category between the upper pie summary card and lower category averages list.
- This caused confusion in monthly interpretation.

What changed:
- Unified percentage denominator in the lower category averages list to use all category averages (same basis used by top pie summary percentages).
- Kept visible rows as top categories, but percentage math now reflects total category spending consistently across both sections.

Files touched:
- `/src/components/dashboard/CategoryAveragesList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-14 - Monthly summary category trend supports multi-select (up to 5) + per-category averages
Why:
- Needed to compare several categories in parallel on monthly trend chart (not only one category).
- Needed visible monthly average expense per selected category for quick budgeting insights.

What changed:
- Category trend chart now supports multi-select up to 5 categories in parallel.
- Switched category trend visualization from single-series area chart to multi-series line chart.
- Added category selection panel with checkbox-based selection and a hard limit message when trying to exceed 5 selections.
- Added quick reset action (`הצג סה״כ הוצאות`) to return to total-expense trend mode.
- Added summary section below chart:
  - monthly average expense per selected category, sorted by highest average.

Files touched:
- `/src/components/monthly-summary/CategoryExpenseTrendChart.tsx`
- `/src/components/monthly-summary/MonthlySummaryView.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Amount-sign parsing hardening (credit/debit correctness)
Why:
- Some transactions that are credit/income in source files could be imported as expenses due sign ambiguity.
- Needed stronger parsing rules for files with `חובה/זכות` columns and mixed minus formats.

What changed:
- `parseAmount` now supports additional minus formats:
  - Unicode minus (`−`),
  - trailing minus,
  - hidden bidi control marks removal before parsing.
- Transaction parser now prioritizes `חובה/זכות` columns when both exist (instead of generic amount), using absolute values by column semantics:
  - `amount = credit - debit`.
- Added fallback to generic amount only when debit/credit cells are empty on that row.
- Credit-card parsing now maps refunds/credits correctly to positive income in system.

Files touched:
- `/src/lib/formatters.ts`
- `/src/services/parsers/FileParserService.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.
- Existing imported rows are not globally auto-fixed in one sweep.
- Re-uploading the same source file now performs a safe in-place correction for rows with the same `מס' שובר` (reference) and opposite sign, and reports `correctedExisting` in upload response.

### 2026-02-13 - Safe-guarded similar-transactions propagation for category assignment
Why:
- Category assignment could occasionally over-propagate to many unrelated transactions (for example 30+ rows), causing incorrect mass recategorization.

What changed:
- `עדכן תנועות דומות` is now disabled by default in category selector.
- Selector resets the propagation checkbox back to its default after close/select, reducing accidental repeated mass updates.
- Added server-side safety fuse for similar-propagation in both manual and AI single-transaction categorization:
  - if potential similar matches exceed safe threshold (`15`), propagation is blocked and only the selected transaction is updated.
  - response now includes safety metadata (`propagationSkippedDueToSafety`, `matchedSimilarCount`).
- Transactions UI now shows explicit toast when propagation was blocked by safety threshold.

Files touched:
- `/src/components/transactions/CategorySelector.tsx`
- `/src/components/transactions/TransactionList.tsx`
- `/src/app/api/transactions/[id]/category/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Global "Back to top" floating button
Why:
- User needed a fast way to return to top on long pages.

What changed:
- Added a global floating `חזרה למעלה` button:
  - appears after scrolling down (`>300px`),
  - smooth-scrolls to page top on click.
- Button is available on app pages and hidden on login page.

Files touched:
- `/src/components/ui/ScrollToTopButton.tsx`
- `/src/components/LayoutShell.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Notes editing added to by-category transactions view
Why:
- Users needed to add/edit notes while working in `לפי קטגוריה` view, not only in list view.

What changed:
- Added inline note UI for each transaction row in `לפי קטגוריה` view:
  - shows existing note text when present,
  - shows `הוסף הערה` action when empty,
  - supports inline edit with save on blur/Enter and cancel on Escape.
- Reused existing notes handlers to keep behavior identical to list view.

Files touched:
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Multi-select enabled in by-category view + sticky bulk action bar
Why:
- User needed bulk category assignment while working in `לפי קטגוריה` view, not only in list view.
- Bulk action bar needed to stay visible while scrolling for faster workflow.

What changed:
- Added row checkboxes in `לפי קטגוריה` transaction rows so multiple rows can be selected there too.
- Bulk assignment action bar is now `sticky` at top while rows are selected.
- Selection is preserved between `רשימה` and `לפי קטגוריה`, and cleared when switching to `מאוחד` (grouped) to avoid hidden selection confusion.

Files touched:
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Multi-select transactions + bulk category assignment
Why:
- Needed a faster workflow to assign the same category to multiple selected transactions at once from the transactions page.
- Single-row assignment was too slow for cleanup tasks.

What changed:
- Added multi-select in transactions `רשימה` view:
  - row checkbox per transaction (mobile + desktop),
  - desktop "select all visible" checkbox with indeterminate state.
- Added bulk action bar when rows are selected:
  - choose target category (`כולל ללא קטגוריה`),
  - apply category to all selected rows,
  - clear selection.
- Bulk assignment is explicit and row-targeted (no merchant-similar propagation).
- Added new API endpoint:
  - `PATCH /api/transactions/bulk-category`
  - validates category and updates selected transactions in one DB operation.
- Cache invalidation now refreshes transactions, recurring, dashboard, and monthly summary views after bulk update.

Files touched:
- `/src/components/transactions/TransactionList.tsx`
- `/src/app/api/transactions/bulk-category/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Safer per-row category updates in by-category view
Why:
- In `לפי קטגוריה` view, changing one row category could unintentionally propagate to many rows (same/generic descriptions).
- User needed precise one-row category change (for example only one `3,850`) without moving unrelated transactions.

What changed:
- Added `defaultApplyToSimilar` support to category selector component.
- In `לפי קטגוריה` rows, default is now single-row update (`applyToSimilar=false` by default in that view).
- Added server-side propagation guard:
  - if source transaction description is too generic (no merchant signature), similar-propagation is skipped even if requested.
  - prevents broad accidental reclassification on generic labels (for example standing-order style descriptions).
- Label text in selector updated from `עדכן תנועות זהות` to `עדכן תנועות דומות`.

Files touched:
- `/src/components/transactions/CategorySelector.tsx`
- `/src/components/transactions/TransactionList.tsx`
- `/src/app/api/transactions/[id]/category/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Category selector dropdown viewport-clamp fix
Why:
- Category selector dropdown could overflow outside the screen edges in transactions UI (especially on mobile / narrow viewport).
- This caused visual breakage and made search/options partially hidden.

What changed:
- Updated category selector dropdown positioning logic to clamp to viewport bounds.
- Position now uses computed `left` + `top` with safe margins instead of fixed-width right anchoring only.
- Dropdown width is now constrained to available viewport width (`min(288px, viewport - margins)`), preventing off-screen rendering.

Files touched:
- `/src/components/transactions/CategorySelector.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Category selector enabled for every row in "by category" view
Why:
- In transactions screen, `לפי קטגוריה` view allowed category assignment only for uncategorized rows.
- Needed direct per-transaction category editing for all rows in grouped/category view.

What changed:
- In `לפי קטגוריה` transaction rows, category selector is now shown for every transaction (not only uncategorized).
- Selector uses current row category when available and still supports uncategorized rows.
- Layout updated to keep date/description on one side and category selector + amount on the other side in responsive mode.

Files touched:
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Monthly summary category trend filter (per-category monthly spend)
Why:
- Needed to analyze monthly spending trend for a specific category (for example: supermarket) and track improvement/increase over time.
- Existing monthly summary showed only global income/expense trend and did not allow category-focused trend analysis.

What changed:
- Added category metadata (`id`) to monthly category breakdown payload.
- Added category options list to monthly summary data model, aggregated across last 12 months.
- Added a new chart section on monthly summary page:
  - `מגמת הוצאות לפי קטגוריה`
  - Category selector (`כל ההוצאות` + specific categories)
  - Monthly trend line/area for selected category only.
- Existing global income/expense trend chart remains unchanged.

Files touched:
- `/src/app/monthly-summary/page.tsx`
- `/src/components/monthly-summary/MonthlySummaryView.tsx`
- `/src/components/monthly-summary/MonthDetail.tsx`
- `/src/components/monthly-summary/CategoryExpenseTrendChart.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Category change now refreshes recurring-expenses view immediately
Why:
- Category changes from the transactions screen were not always reflected immediately in the recurring-expenses page.
- Main cause was route caching/static behavior without explicit invalidation after mutation.

What changed:
- Recurring page was switched to dynamic rendering (`force-dynamic`) to always read fresh DB state.
- Added explicit cache invalidation after single-transaction category updates and single-transaction AI categorization:
  - `/transactions`
  - `/recurring`
  - `/`
- This ensures recurring category grouping updates immediately after category change actions.

Files touched:
- `/src/app/recurring/page.tsx`
- `/src/app/api/transactions/[id]/category/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Fixed recurring-expenses duplication when amount varies
Why:
- Recurring obligations were split into multiple rows when the same merchant had small amount variations over time.
- This inflated fixed-expense totals and made planning unreliable (same recurring obligation shown multiple times).

What changed:
- Recurring expenses are now clustered by merchant-family similarity (same category + similar merchant name), not by exact amount.
- Added monthly amount strategy selector on recurring page:
  - `לפי הגבוה ביותר (מומלץ)` (default, conservative planning),
  - `לפי ממוצע`.
- Category totals and overall fixed-expense total now use the selected strategy.
- Each recurring row now shows range context when amounts vary:
  - average amount,
  - min-max range across historical occurrences.
- Removing a recurring item from the recurring page now removes recurring flag for the whole merchant family (not only identical description+amount).

Files touched:
- `/src/components/recurring/RecurringExpensesList.tsx`
- `/src/app/api/transactions/[id]/recurring/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Similar-transactions propagation upgraded to merchant-family matching
Why:
- Manual category assignment propagation was too strict (`description` exact equality only), so branch variants were missed.
- Real examples: assigning category to `סטימצקי זכרון` did not update `סטימצקי עין שמר`; same issue for short two-word brands like `רי בר`.

What changed:
- Added merchant similarity engine with normalization and signature matching:
  - handles punctuation/spacing/niqqud normalization,
  - skips generic banking words (transfer/charge/etc.),
  - supports short two-word merchant signatures (e.g. `רי בר`),
  - matches by merchant-family similarity (not exact text only).
- Manual category update endpoint now propagates to **similar merchant transactions** (same amount sign), not only identical descriptions.
- Single-transaction AI categorization propagation now uses the same merchant-family matching logic.
- Both endpoints now return `updatedSimilarIds` so client state updates immediately by IDs.
- Transactions UI local-state update switched from description-equality to `updatedSimilarIds` application for accurate immediate feedback.
- Learning keyword extraction now uses merchant signature extraction, improving future auto-categorization learning for branch variants.
- User-facing wording changed from "עסקאות זהות" to "עסקאות דומות" where relevant.

Files touched:
- `/src/lib/merchantSimilarity.ts`
- `/src/lib/keywords.ts`
- `/src/app/api/transactions/[id]/category/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-13 - Switched AI categorization provider to OpenAI (gpt-5-mini)
Why:
- User requested migration from Anthropic to OpenAI and a default model of `gpt-5-mini`.
- Existing settings/UI/API were hard-wired to Anthropic keys and Claude endpoint.

What changed:
- Auto-categorization provider switched from Anthropic Messages API to OpenAI Chat Completions API.
- Default model is now `gpt-5-mini` (configurable via `OPENAI_MODEL` env var).
- AI key resolution now uses:
  - DB setting key: `openai_api_key`
  - env fallback: `OPENAI_API_KEY`
- Settings API now stores/reads/deletes `openai_api_key` and validates `sk-` format.
- Settings page was updated from "Anthropic" to "OpenAI", including key placeholder and console link.
- `.env.example` updated with:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL="gpt-5-mini"`
- Existing robust auto-categorize matching/chunking logic remains in place and now runs on OpenAI responses.

Files touched:
- `/src/lib/autoCategorize.ts`
- `/src/app/api/transactions/auto-categorize/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`
- `/src/app/api/settings/api-key/route.ts`
- `/src/app/settings/page.tsx`
- `/.env.example`

Deploy/runtime impact:
- Requires normal deploy only.
- To activate AI classification in production, set/save a valid OpenAI API key (`sk-...`) via Settings or `OPENAI_API_KEY` in `.env`.
- Optional model override: `OPENAI_MODEL`; default remains `gpt-5-mini`.
- No DB migration needed.

### 2026-02-12 - Auto-categorize reliability fix for large uncategorized sets
Why:
- Auto-categorize could return `0` even with many uncategorized transactions due fragile AI response matching and batch size limitations.
- Real case observed: ~196 uncategorized rows with no successful categorization.

What changed:
- Global auto-categorize now processes transactions in larger scope (`take: 500`) and chunks description identification requests in batches of 40.
- Added resilient mapping from AI response keys to transaction descriptions (exact/trim/normalized/fuzzy token overlap), instead of strict exact-string key match only.
- Improved category matching from AI label to real category:
  - normalized matching,
  - contains matching,
  - token-overlap fallback.
- AI flow now falls back to local heuristics if Claude call returns empty/unparseable output.
- Claude response parsing is now more robust (handles code fences, smart quotes, and normalized JSON extraction).
- Heuristic business-pattern mapping now resolves aliases to existing categories dynamically, instead of hardcoded category labels only.
- Same robust description-key resolution was applied to single-transaction auto-categorize endpoint.

Files touched:
- `/src/lib/autoCategorize.ts`
- `/src/app/api/transactions/auto-categorize/route.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Login "Remember me" + brute-force protection
Why:
- Needed persistent login only when user explicitly requests it.
- Needed defensive protection against bot/script password guessing on the public URL.

What changed:
- Login form now includes `זכור אותי` checkbox (default enabled).
- Login API now accepts `rememberMe`:
  - `true` => persistent auth cookie (14 days),
  - `false` => session cookie (expires when browser is closed).
- Added IP-based login rate limit (in-memory, server-side):
  - window: 15 minutes,
  - max failed attempts in window: 7,
  - temporary block duration after limit: 30 minutes.
- Wrong-credentials response now includes remaining attempts until temporary block.
- Rate-limited responses return HTTP `429` and `Retry-After` header.

Files touched:
- `/src/components/auth/LoginForm.tsx`
- `/src/app/api/auth/login/route.ts`
- `/src/lib/loginRateLimit.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- Rate-limit state is in-memory and resets on process restart/redeploy.
- No DB migration needed.

### 2026-02-12 - Added login protection for public URL access
Why:
- The app is on a public URL and needed a basic access gate to block unwanted/bot browsing.
- Requirement was a single username/password (not a full multi-user system).

What changed:
- Added login screen at `/login` with username + password form.
- Added auth API endpoints:
  - `POST /api/auth/login` (sets secure HTTP-only session cookie)
  - `POST /api/auth/logout` (clears cookie)
- Added global route protection via middleware:
  - all app pages and APIs require auth cookie,
  - public exceptions: `/login`, `/api/auth/login`, `/api/telegram/webhook`, static Next assets.
- Added logout button in sidebar (desktop + mobile).
- Added route-aware layout shell to hide app navigation on login page.
- Auth config supports env overrides:
  - `AUTH_USERNAME`
  - `AUTH_PASSWORD_SHA256` (SHA-256 hash of password)
  - `AUTH_COOKIE_TOKEN`
- Included safe defaults so the gate works immediately after deploy even without new env vars.

Files touched:
- `/src/lib/auth.ts`
- `/src/middleware.ts`
- `/src/app/api/auth/login/route.ts`
- `/src/app/api/auth/logout/route.ts`
- `/src/app/login/page.tsx`
- `/src/components/auth/LoginForm.tsx`
- `/src/components/LayoutShell.tsx`
- `/src/app/layout.tsx`
- `/src/components/Sidebar.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- Recommended: set auth env vars in production `.env` and copy into `.next/standalone/.env` during deploy.
- No DB migration needed.

### 2026-02-12 - Full responsive/mobile layout pass across core screens
Why:
- The app was desktop-first and parts of the UI were hard to use on phones (fixed sidebar overlap, crowded filters, wide tables).
- Needed a consistent mobile experience without breaking desktop workflows.

What changed:
- Reworked app shell for mobile:
  - desktop keeps fixed right sidebar,
  - mobile gets a fixed top bar with hamburger + slide-out drawer navigation.
- Main layout spacing is now responsive (`pt-20` on mobile for top bar, desktop margin for sidebar), with horizontal overflow guarded.
- Transactions screen mobile overhaul:
  - filters and month controls now wrap/stack correctly,
  - list and grouped views now have dedicated mobile card layouts,
  - desktop tables remain for medium+ screens.
- Category view rows and totals footer in transactions now wrap cleanly on narrow screens.
- Recurring expenses rows/headers/footer now stack correctly on mobile and avoid text clipping.
- Dashboard category pie section now stacks chart + legend on mobile.
- Categories page header/actions and form action buttons now stack responsively.
- Upload flow improved for mobile:
  - smaller drop zone padding on small screens,
  - action button rows stack on mobile,
  - long uploaded file names now truncate safely.
- Category icon grid and color picker behavior refined for mobile widths.

Files touched:
- `/src/app/layout.tsx`
- `/src/components/Sidebar.tsx`
- `/src/components/transactions/TransactionList.tsx`
- `/src/components/monthly-summary/MonthDetail.tsx`
- `/src/components/recurring/RecurringExpensesList.tsx`
- `/src/components/dashboard/CategoryPieChart.tsx`
- `/src/components/upload/FileUploadZone.tsx`
- `/src/app/categories/page.tsx`
- `/src/app/page.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Recurring expenses page switched to monthly-obligations view
Why:
- The recurring expenses page summed every historical occurrence, which inflated totals and did not answer "how much fixed cost starts each month".
- Users needed one-line-per-obligation (for example a monthly check) and a clear "remaining for variable expenses" indicator.
- Count cards were showing a currency symbol even for non-currency metrics.

What changed:
- Recurring list now deduplicates recurring expenses into monthly obligations by:
  - category + normalized description + absolute amount.
- Each fixed obligation appears once (not once per month history), with:
  - monthly amount,
  - last charge date,
  - number of historical occurrences.
- Added monthly planning summary cards:
  - total monthly fixed obligations,
  - remaining for variable expenses (`average monthly income - fixed obligations`),
  - number of fixed obligations,
  - number of fixed categories.
- Added numeric display mode to `SummaryCard` to render counts without `₪`.
- Removing a fixed obligation from this page now removes recurring flag for all identical transactions (same category + description + amount), not only one row.
- Category section now reflects all categories that have unique fixed obligations.

Files touched:
- `/src/components/recurring/RecurringExpensesList.tsx`
- `/src/app/recurring/page.tsx`
- `/src/app/api/transactions/[id]/recurring/route.ts`
- `/src/components/dashboard/SummaryCard.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Dashboard switched to general monthly averages view
Why:
- The dashboard showed "current month" values, while users needed a general financial snapshot.
- Needed explicit monthly averages for income/expenses/balance and average spend by category.

What changed:
- Dashboard summary cards now show monthly averages (income, expense, balance, savings) instead of only current-month totals.
- Monthly average base is computed from months that actually have transactions, preventing under-reporting when historical data is partial.
- Category chart values now represent average monthly spend per category.
- Added a dedicated bottom section listing average monthly spend by category (amount + share).
- Fixed dashboard analytics query window to align with the displayed 6-month trend range.

Files touched:
- `/src/app/page.tsx`
- `/src/components/dashboard/CategoryPieChart.tsx`
- `/src/components/dashboard/CategoryAveragesList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Optional "update similar transactions" toggle on manual category change
Why:
- Automatic propagation by identical description is useful in many cases, but can be wrong for generic descriptions (e.g., transfers with different business meaning).
- Users needed explicit control to update only the current row when required.

What changed:
- Category selector now includes a second checkbox:
  - `עדכן תנועות זהות`
- When checked: behavior stays the same and updates identical transactions.
- When unchecked: category update applies only to the selected transaction.
- API endpoint accepts and respects new flag:
  - `applyToSimilar` (default `true`)

Files touched:
- `/src/components/transactions/CategorySelector.tsx`
- `/src/components/transactions/TransactionList.tsx`
- `/src/app/api/transactions/[id]/category/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Single-transaction AI now propagates to identical transactions
Why:
- Users expected per-transaction AI categorization to behave like manual category change and update identical transactions too.

What changed:
- In single-transaction AI endpoint, after selecting a category, the system now updates all transactions with the same description (case-insensitive) to that category.
- Endpoint now returns `updatedSimilar` count.
- Transactions UI now applies this propagated update immediately in local state and shows a toast with the count.

Files touched:
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`
- `/src/components/transactions/TransactionList.tsx`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

### 2026-02-12 - Sharpened single-transaction AI categorization logic
Why:
- Per-transaction AI re-check could confirm an existing wrong category due dependency on previously learned keywords.
- Example observed: "תמנון" should map to clothing category, not restaurants.

What changed:
- Single-transaction AI flow now runs with keyword-fallback disabled (it no longer trusts existing learned keywords for this specific action).
- Added explicit "תמנון" mapping to clothing in heuristic rules.
- Strengthened Claude prompt with explicit guidance that "תמנון" belongs to clothing.
- If AI returns the same category, response message now states that an AI check was performed (not just "already assigned").

Files touched:
- `/src/lib/autoCategorize.ts`
- `/src/app/api/transactions/[id]/auto-categorize/route.ts`

Deploy/runtime impact:
- Requires normal deploy only.
- No DB migration needed.

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
