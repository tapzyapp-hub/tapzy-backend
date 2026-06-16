CREATE TABLE IF NOT EXISTS "UserBlock" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "userblock_blockerId_blockedId_key"
  ON "UserBlock"("blockerId", "blockedId");

CREATE INDEX IF NOT EXISTS "userblock_blockerId_idx"
  ON "UserBlock"("blockerId");

CREATE INDEX IF NOT EXISTS "userblock_blockedId_idx"
  ON "UserBlock"("blockedId");

CREATE INDEX IF NOT EXISTS "userblock_createdAt_idx"
  ON "UserBlock"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserBlock_blockerId_fkey'
  ) THEN
    ALTER TABLE "UserBlock"
      ADD CONSTRAINT "UserBlock_blockerId_fkey"
      FOREIGN KEY ("blockerId") REFERENCES "UserProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserBlock_blockedId_fkey'
  ) THEN
    ALTER TABLE "UserBlock"
      ADD CONSTRAINT "UserBlock_blockedId_fkey"
      FOREIGN KEY ("blockedId") REFERENCES "UserProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
