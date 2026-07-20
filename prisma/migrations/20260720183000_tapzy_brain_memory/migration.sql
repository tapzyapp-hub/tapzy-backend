CREATE TABLE IF NOT EXISTS "TapzyBrainMemory" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL DEFAULT 'global',
  "role" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'turn',
  "content" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TapzyBrainMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tapzybrain_session_created_idx" ON "TapzyBrainMemory" ("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "tapzybrain_kind_created_idx" ON "TapzyBrainMemory" ("kind", "createdAt");