-- Track which physical NFC cards have already been written by the encoder.
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "encoded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "encodedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "card_encoded_createdAt_idx" ON "Card"("encoded", "createdAt");
