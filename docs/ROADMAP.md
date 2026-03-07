# Family Finance - Product Roadmap

Last updated: 2026-03-07

## Product goal
The next phase should optimize the system for `freshness of data`, not only historical analysis

Because there is no live bank sync yet, the main product loop should be:
- collect data quickly
- remind when data is missing
- process and categorize
- surface what needs action right now

## Release strategy

### Batch 1 - Telegram ingestion MVP
Primary goal:
- make uploading from mobile fast enough that the user will actually keep the current month updated

Why first:
- the repository already contains Telegram infrastructure
- this is the shortest path to real usage improvement
- without fresh uploads, budgeting and alerts are weaker

What already exists in code:
- Telegram bot service
  - `/src/services/telegram/TelegramBotService.ts`
- webhook endpoint
  - `/src/app/api/telegram/webhook/route.ts`
- webhook setup endpoint
  - `/src/app/api/telegram/setup/route.ts`

Current gaps:
- no strict authorized-user gate by Telegram chat/user id
- no explicit support flow for `photo` messages
- no upload inbox/status view in app for Telegram-origin uploads
- no quick action links back into the web app
- upload messaging is basic and not optimized for production support

MVP scope:
- authorize only configured Telegram users/chats
- accept `document`
- optionally accept `photo` as image upload path if parser supports image OCR path cleanly
- send clear upload result:
  - imported
  - duplicates skipped
  - failed rows
  - institution detected
- keep file origin metadata as `telegram`
- add in-app recent upload status list with source badge
- add quick CTA in reply:
  - "open transactions"
  - "open uncategorized"

Recommended config additions:
- `TELEGRAM_ALLOWED_CHAT_IDS`
- optional `APP_BASE_URL` for deep links

Recommended UI additions:
- upload history card or table in `/upload`
- source badge: `web` / `telegram`
- error state for failed Telegram upload attempts

Success criteria:
- user can send a supported file from mobile and get a useful answer in Telegram
- imported transactions appear in the system without manual desktop upload
- unauthorized Telegram senders are rejected

Out of scope for Batch 1:
- advanced conversational commands
- recurring reminders
- approval workflows inside Telegram
- image OCR if current OCR path is not production-safe yet

### Batch 2 - Reminder engine
Primary goal:
- reduce missed uploads and missing-source months

What it should do:
- scheduled reminders through Telegram
- rule-based reminders, not only static cron

Initial rules:
- remind every Thursday evening if no upload was made this week
- remind if current month is missing bank checking data
- remind if current month is missing at least one credit-card source
- remind if there are uncategorized transactions above threshold

Recommended UX:
- each reminder should include quick actions:
  - upload now
  - snooze to tomorrow
  - snooze to next week
  - dismiss this rule for current period

Technical shape:
- scheduled worker or cron-triggered route
- reminder log table or setting-based state
- per-rule deduplication to avoid spam

Current MVP status:
- implemented
- settings live in `/settings`
- secure cron endpoint added at `/api/telegram/reminders/run`
- manual `send test now` action added in `/settings`
- conditions currently supported:
  - no upload in the last 7 days
  - missing current-period source
  - uncategorized transactions in the current period

Still missing for later expansion:
- per-rule snooze/dismiss from Telegram
- threshold configuration for uncategorized count
- richer reminder history/audit log
- different reminder schedules per rule

### Batch 3 - Current month control center
Primary goal:
- shift the app from retrospective reporting to current-month management

Recommended placement:
- add a top dashboard section called `החודש הנוכחי`

It should show:
- available to spend this month
- days remaining in period
- variable budget remaining
- missing sources for the active period
- uncategorized count
- uploads freshness status

Recommended cards:
- `מה נשאר לי`
- `חסרים נתונים`
- `חריגות תקציב`
- `לטיפול עכשיו`

### Batch 4 - Smart nudges
Primary goal:
- proactively point out problems before month-end

Examples:
- spending in supermarket category is ahead of normal pace
- no credit-card upload detected for 18 days
- recurring expense likely ended
- recurring income likely missing this period

UX principle:
- low-noise, action-oriented nudges
- every nudge should support:
  - accept
  - dismiss
  - snooze

### Batch 5 - Telegram as action surface
Primary goal:
- let the user operate the system from mobile without opening the site for common actions

Candidate commands:
- `/status`
- `/missing`
- `/uncategorized`
- `/month`
- `/add`
- `/help`

Later action ideas:
- confirm recurring suggestion
- add manual cash expense
- ask for category on latest unmatched transaction

## Recommended execution order
1. Batch 1 - Telegram ingestion MVP
2. Batch 2 - Reminder engine
3. Batch 3 - Current month control center
4. Batch 4 - Smart nudges
5. Batch 5 - Telegram as action surface

## Detailed execution plan - Batch 1

### Product decision
Batch 1 should be intentionally small and reliable

The correct first release is:
- secure Telegram ingestion
- simple upload acknowledgment
- recent-upload visibility in app

It should not start with:
- AI chat inside Telegram
- OCR-heavy image flows unless already production-safe
- multi-step approval conversations

### Proposed implementation slices

#### Slice 1 - Security and authorization
- add env for allowed Telegram chat ids
- reject unauthorized chats/users before any file processing
- log blocked attempts

Likely files:
- `/src/services/telegram/TelegramBotService.ts`
- `/src/app/api/telegram/webhook/route.ts`
- `/.env.example`

#### Slice 2 - Upload source metadata
- mark Telegram uploads with a source field or structured note
- expose this in upload history and admin debugging

Likely files:
- `/prisma/schema.prisma` if a new field is needed
- `/src/app/api/upload/route.ts`
- `/src/services/telegram/TelegramBotService.ts`
- `/src/components/upload/FileUploadZone.tsx`

Preferred approach:
- if possible, add a dedicated `source` enum/field on `FileUpload`
- avoid overloading filename or notes for origin tracking

#### Slice 3 - Better Telegram upload replies
- send compact result message with:
  - file name
  - institution
  - imported count
  - duplicates count
  - errors count
- include direct web link if base URL is configured

Likely files:
- `/src/services/telegram/TelegramBotService.ts`

#### Slice 4 - Recent upload inbox in app
- show recent uploads and source on `/upload`
- make Telegram uploads visible so troubleshooting is easy

Likely files:
- `/src/app/upload/page.tsx`
- `/src/components/upload/FileUploadZone.tsx`
- possible new component under `/src/components/upload/`

### Open technical decision
Image support should be gated

Recommended rule:
- support `photo` only if there is already a reliable OCR/parsing path inside this repository
- otherwise ship Batch 1 with `document` only and add images in Batch 1.5 or Batch 2

Reason:
- document uploads already map to the parsing pipeline cleanly
- images can create false expectations and noisy failures

### Definition of done - Batch 1
- webhook configured and secure
- only authorized Telegram senders can upload
- successful Telegram upload imports transactions into the same pipeline used by web uploads
- upload result is visible in Telegram and in app
- documentation updated with setup steps and env keys

## Product principles for the next phase
- freshness over historical completeness
- every alert should have an action
- mobile flows must be shorter than desktop flows
- avoid adding AI where rules are stronger and cheaper
