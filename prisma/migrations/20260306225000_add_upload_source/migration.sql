CREATE TYPE "UploadSource" AS ENUM ('WEB', 'TELEGRAM');

ALTER TABLE "FileUpload"
ADD COLUMN "source" "UploadSource" NOT NULL DEFAULT 'WEB';

CREATE INDEX "FileUpload_source_processedAt_idx" ON "FileUpload"("source", "processedAt");
