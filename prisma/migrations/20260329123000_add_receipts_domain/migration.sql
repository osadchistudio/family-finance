-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReceiptItemReviewStatus" AS ENUM ('UNREVIEWED', 'CONFIRMED', 'EDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductAliasSource" AS ENUM ('OCR', 'USER', 'IMPORT');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chain" TEXT,
    "branchName" TEXT,
    "branchAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "brand" TEXT,
    "categoryName" TEXT,
    "barcode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source" "ProductAliasSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseAt" TIMESTAMP(3),
    "totalAmount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "imageStorageKey" TEXT,
    "thumbnailStorageKey" TEXT,
    "rawOcrText" TEXT,
    "parserVersion" TEXT,
    "parseError" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT,
    "rawName" TEXT NOT NULL,
    "normalizedName" TEXT,
    "brand" TEXT,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "unitPrice" DECIMAL(12,2),
    "linePrice" DECIMAL(12,2),
    "discountAmount" DECIMAL(12,2),
    "confidenceScore" DOUBLE PRECISION,
    "reviewStatus" "ReceiptItemReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "receiptItemId" TEXT,
    "storeId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(12,3),
    "unitPrice" DECIMAL(12,2),
    "linePrice" DECIMAL(12,2),
    "promotionLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Store_name_idx" ON "Store"("name");

-- CreateIndex
CREATE INDEX "Store_chain_name_idx" ON "Store"("chain", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_canonicalName_idx" ON "Product"("canonicalName");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_productId_alias_key" ON "ProductAlias"("productId", "alias");

-- CreateIndex
CREATE INDEX "ProductAlias_alias_idx" ON "ProductAlias"("alias");

-- CreateIndex
CREATE INDEX "Receipt_status_capturedAt_idx" ON "Receipt"("status", "capturedAt");

-- CreateIndex
CREATE INDEX "Receipt_purchaseAt_idx" ON "Receipt"("purchaseAt");

-- CreateIndex
CREATE INDEX "Receipt_storeId_purchaseAt_idx" ON "Receipt"("storeId", "purchaseAt");

-- CreateIndex
CREATE INDEX "ReceiptItem_receiptId_idx" ON "ReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptItem_productId_idx" ON "ReceiptItem"("productId");

-- CreateIndex
CREATE INDEX "PriceObservation_productId_observedAt_idx" ON "PriceObservation"("productId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceObservation_storeId_observedAt_idx" ON "PriceObservation"("storeId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceObservation_receiptItemId_idx" ON "PriceObservation"("receiptItemId");

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "ReceiptItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
