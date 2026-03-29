# Family Finance - Receipts Mobile App Plan

Last updated: 2026-03-29

## Purpose
Plan a separate mobile app that connects to `family-finance` and focuses on supermarket receipt capture, product tracking, and price intelligence over time.

This document is intentionally product + architecture oriented. It does not assume that the mobile app code should live in this repository.

## Product goal
The mobile app should make receipt capture fast enough that the user will actually use it at the end of a grocery shopping trip.

The app should later help answer questions such as:
- what products do I buy repeatedly
- which products became more expensive
- how often do I buy product `X`
- whether similar baskets or products are cheaper in another store
- where the original receipt image is stored

## Non-goals for v1
- replacing the current bank / credit-card ingestion flow
- perfect OCR on day one
- automatic cross-store price comparison without user review
- full accounting reconciliation between receipts and card transactions
- Android support before the iPhone experience feels fast and reliable

## Separation rules

### Codebase separation
- Keep the mobile app in a separate repository, for example:
  - `family-finance-mobile`
- Keep `family-finance` as the existing web app + backend system
- Add receipt APIs to the current backend only as a dedicated domain, not mixed into transaction upload flows
- If shared types are needed later, prefer one of:
  - generated API types from the backend
  - a tiny shared package with DTOs only

### Infra separation
- Separate CI/CD pipeline for the mobile app
- Separate app secrets and mobile auth tokens
- Separate storage path or bucket for receipt images
- Separate API namespace for mobile receipt features, for example:
  - `/api/receipts`
  - `/api/receipts/:id`
  - `/api/receipts/:id/items`
  - `/api/products`

### Data separation
Do not force receipts into the current `Transaction` model.

The current schema is optimized for financial movements, not itemized shopping history. Receipt data should be modeled as its own domain and linked to transactions only optionally later.

## Recommended stack

### Mobile app
- Recommended default: `React Native + Expo`
- Why:
  - fast path to a real iPhone app
  - good camera support
  - easy local iteration
  - clean path to TestFlight
  - possible Android support later without rewriting the whole app

### Backend
- Keep using the current `family-finance` backend
- Add a receipt domain to the existing backend only when the mobile API contract is clear
- Store receipt images in object storage, not in Postgres blobs

### OCR/parsing
- Receipt image capture should be decoupled from OCR success
- The app should save the image first, then upload, then parse
- OCR should be allowed to be asynchronous and reviewable

## Core UX principle
`capture first, parse later`

The fastest version of the app is not the one that finishes OCR immediately. It is the one that lets the user open the app, take a picture, confirm it quickly, and leave the supermarket.

## iPhone-first UX requirements
- If the user is already authenticated, app open should land directly on the capture screen
- Camera permission should be requested once during onboarding, not at the moment of urgency
- The capture button must be immediately visible on first screen load
- The app should not open into analytics, history, or settings first
- The image should be stored locally immediately after capture
- Upload and OCR should happen in the background after capture when possible
- The post-capture review should be minimal:
  - `שמור`
  - `צלם שוב`
- Avoid forcing category selection or product correction before the receipt is safely stored

## Suggested information architecture

### Main tabs
- `Capture`
- `Receipts`
- `Products`
- `Insights`
- `Settings`

### Launch behavior
- Default app launch target: `Capture`
- If there is a pending failed upload or OCR review, show a subtle indicator, not a blocking modal

## Proposed v1 flow
1. User opens app
2. Camera screen is immediately available
3. User takes receipt photo
4. User confirms `שמור` or `צלם שוב`
5. App stores the image locally and queues upload
6. Backend creates a `Receipt` record with `PROCESSING` status
7. OCR/parser extracts candidate store, date, total, and line items
8. User later reviews uncertain fields if needed

## Proposed data model

### Receipt
- `id`
- `userId` or family scope id
- `storeId`
- `capturedAt`
- `purchaseAt`
- `totalAmount`
- `currency`
- `status`
  - `PENDING_UPLOAD`
  - `PROCESSING`
  - `NEEDS_REVIEW`
  - `COMPLETED`
  - `FAILED`
- `imageUrl`
- `thumbnailUrl`
- `rawOcrText`
- `parserVersion`

### ReceiptItem
- `id`
- `receiptId`
- `productId` nullable
- `rawName`
- `normalizedName`
- `brand`
- `quantity`
- `unit`
- `unitPrice`
- `linePrice`
- `discountAmount`
- `confidenceScore`
- `reviewStatus`

### Product
- `id`
- `canonicalName`
- `brand`
- `category`
- `barcode` nullable
- `isActive`

### ProductAlias
- `id`
- `productId`
- `alias`
- `source`
  - `OCR`
  - `USER`
  - `IMPORT`

### PriceObservation
- `id`
- `productId`
- `receiptItemId`
- `storeId`
- `observedAt`
- `unitPrice`
- `linePrice`
- `quantity`
- `promotionLabel` nullable

### Store
- `id`
- `name`
- `chain`
- `branchName` nullable
- `branchAddress` nullable

### Optional future link
`ReceiptTransactionLink`
- optional link between a receipt total and a bank/card transaction
- not required for v1

## Suggested API surface

### Receipt ingestion
- `POST /api/receipts`
  - create draft receipt + upload target
- `POST /api/receipts/:id/image`
  - attach the captured image
- `POST /api/receipts/:id/process`
  - trigger OCR/parsing
- `GET /api/receipts/:id`
  - receipt summary + parsing status
- `PATCH /api/receipts/:id`
  - fix top-level metadata

### Receipt items
- `GET /api/receipts/:id/items`
- `PATCH /api/receipts/:id/items/:itemId`
- `POST /api/receipts/:id/complete-review`

### Product history
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/products/:id/price-history`
- `GET /api/products/:id/purchase-frequency`

## MVP scope

### Phase 1 - Receipt capture backbone
- iPhone app shell
- authentication
- camera-first flow
- image upload
- receipt status list

### Phase 2 - OCR and review
- OCR pipeline
- parser output
- review screen for uncertain fields
- normalized store/date/total extraction

### Phase 3 - Item intelligence
- line-item extraction
- product normalization
- first product history screen
- first price change alerts

### Phase 4 - Cross-store and habit insights
- similar basket comparison
- product frequency
- cheaper alternative store signals
- recurring grocery behavior trends

## iPhone delivery path

### Development
- Build the mobile app as a real iPhone app using `Expo / React Native`
- Run it locally on iPhone during development
- Keep the camera flow optimized first, not the analytics screens

### Distribution
- Use `TestFlight` before any App Store release
- Treat TestFlight as the main beta loop for:
  - capture speed
  - OCR reliability
  - review friction

## Important product decisions

### Decision 1 - The app must open fast
The app should optimize for the moment immediately after checkout.

This means:
- direct capture entry
- minimal tap count
- no forced dashboard landing
- upload reliability over visual complexity

### Decision 2 - Receipt images are primary assets
The image is the source of truth.

This means:
- preserve the original photo
- do not discard it after OCR
- allow reparsing later if parser logic improves

### Decision 3 - OCR uncertainty is normal
The system should support review instead of pretending parsing is always correct.

This means:
- explicit `NEEDS_REVIEW` status
- item confidence tracking
- user correction flow

## Open decisions
- What object storage should hold receipt images
- Which OCR provider or OCR pipeline should be used first
- Whether the first release should support only Hebrew receipts or mixed Hebrew/English
- Whether product normalization should start rule-based or include AI assistance for hard cases
- Whether receipt totals should try to auto-link to existing transactions in v1.5 or only later

## Recommended next implementation step
Create a dedicated technical design for:
- initial Prisma schema additions for receipt domain
- backend upload and processing flow
- mobile navigation structure
- authentication strategy for mobile clients
