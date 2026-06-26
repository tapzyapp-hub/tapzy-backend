-- Permanent NFC card URLs for first-tap activation.
CREATE TABLE IF NOT EXISTS "Card" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" TEXT,
    "activated" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "giftFrom" TEXT,
    "giftMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Card_code_key" ON "Card"("code");
CREATE INDEX IF NOT EXISTS "card_ownerId_idx" ON "Card"("ownerId");
CREATE INDEX IF NOT EXISTS "card_activated_createdAt_idx" ON "Card"("activated", "createdAt");

DO $$ BEGIN
    ALTER TABLE "Card" ADD CONSTRAINT "Card_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
