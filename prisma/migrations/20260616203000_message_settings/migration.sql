ALTER TABLE "ConversationMember"
  ADD COLUMN IF NOT EXISTS "mutedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "conversationmember_profileId_archivedAt_idx"
  ON "ConversationMember"("profileId", "archivedAt");

CREATE INDEX IF NOT EXISTS "conversationmember_profileId_pinnedAt_idx"
  ON "ConversationMember"("profileId", "pinnedAt");
