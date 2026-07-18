CREATE TABLE IF NOT EXISTS "TapzyPlaceSnapshot" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'tapzy_search',
    "sourceExternalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT DEFAULT 'CA',
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION,
    "reviews" INTEGER,
    "price" TEXT,
    "hours" TEXT,
    "website" TEXT,
    "directions" TEXT,
    "phone" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "raw" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TapzyPlaceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TapzyUserMemory" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'preference',
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'assistant',
    "metadata" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TapzyUserMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TapzyPlaceSnapshot_sourceExternalKey_key" ON "TapzyPlaceSnapshot"("sourceExternalKey");
CREATE INDEX IF NOT EXISTS "tapzyplace_city_category_idx" ON "TapzyPlaceSnapshot"("city", "category");
CREATE INDEX IF NOT EXISTS "tapzyplace_rating_idx" ON "TapzyPlaceSnapshot"("rating");
CREATE INDEX IF NOT EXISTS "tapzyplace_lastSeenAt_idx" ON "TapzyPlaceSnapshot"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "tapzyplace_tags_idx" ON "TapzyPlaceSnapshot" USING GIN ("tags");
CREATE UNIQUE INDEX IF NOT EXISTS "tapzyusermemory_profile_scope_key_value_key" ON "TapzyUserMemory"("profileId", "scope", "key", "value");
CREATE INDEX IF NOT EXISTS "tapzyusermemory_profile_scope_idx" ON "TapzyUserMemory"("profileId", "scope");
CREATE INDEX IF NOT EXISTS "tapzyusermemory_key_value_idx" ON "TapzyUserMemory"("key", "value");
CREATE INDEX IF NOT EXISTS "tapzyusermemory_updatedAt_idx" ON "TapzyUserMemory"("updatedAt");

DO $$ BEGIN
  ALTER TABLE "TapzyUserMemory" ADD CONSTRAINT "TapzyUserMemory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

