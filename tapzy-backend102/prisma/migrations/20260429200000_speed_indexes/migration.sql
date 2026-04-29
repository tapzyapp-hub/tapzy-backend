-- Speed indexes for the Events feed and Going counts.
CREATE INDEX IF NOT EXISTS "eventfinderitem_city_startAt_idx" ON "EventFinderItem"("city", "startAt");
CREATE INDEX IF NOT EXISTS "eventfinderitem_category_startAt_idx" ON "EventFinderItem"("category", "startAt");
CREATE INDEX IF NOT EXISTS "eventattendance_status_eventId_idx" ON "EventAttendance"("status", "eventId");
