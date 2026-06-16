# Tapzy speed tuning patch

Applied safe speed fixes that should not change Tapzy's visual style:

1. Static asset caching in `src/app.js`
   - Public assets cache for 7 days.
   - Uploaded media cache for 30 days.
   - HTML remains dynamic/no-cache.

2. Lighter session lookup in `src/middleware.js`
   - Session middleware now selects only needed account fields plus profile.
   - Avoids returning passwordHash on every signed-in request.

3. Messaging live fallback tuning in `src/messages/pages/renderConversationPage.js`
   - Socket.IO remains the fast live path.
   - Polling now only runs when socket is disconnected, every 8 seconds instead of always every 3 seconds.

4. Events feed query/count tuning in `src/events/handlers/getEventsFeed.js`
   - Pulls only enough events for the requested page plus a buffer.
   - Uses `groupBy` for Going counts instead of loading every attendance row.

5. Media loading hints
   - Added lazy/async image loading to message and story/profile preview images.
   - Main profile photo stays eager so the top profile area still appears immediately.

6. Database indexes
   - Added Prisma schema indexes for event city/startAt, category/startAt, and attendance status/eventId.
   - Added matching migration: `prisma/migrations/20260429200000_speed_indexes/migration.sql`.

After uploading/deploying, run:

```bash
npm install
npx prisma migrate deploy
npm start
```

## Final polish pass

- Added `compression` as a real production dependency instead of an optional missing module.
- Replaced hardcoded service/admin key defaults with environment-only configuration.
- Shared CORS origin checks between Express and Socket.IO.
- Made production admin access fail closed when `ADMIN_KEY` is not configured.
- Removed password reset URL logging when email delivery is not configured.
- Removed the duplicated nested `src/src` source tree from the deployable app.
- Replaced the placeholder test script with `npm run check && npx prisma validate`.
- Ran `npm audit fix`; `npm audit --audit-level=moderate` now reports 0 vulnerabilities.
- Updated the profile photo cropper overlay from a circle to the same rounded-square shape used by the profile image.
- Reset saved profile photo fit values after creating a cropped image so the rendered profile photo matches the crop view exactly.
- Updated event cards so the blue glow uses the same pointer-position variables on initial and loaded cards instead of staying pinned to one corner.
- Added WhatsApp-style messaging settings: pin/unpin, mute/unmute, archive/unarchive, archived inbox tab, chat settings menu, and mute-aware message notifications.
- Added a dedicated `/settings` app settings hub with phone-first layout, account/profile/message/privacy/notification shortcuts, and local device preferences for compact layout, reduced motion, and stronger contrast.
- Removed old private vault/connections links from the app settings and disabled the legacy vault/connections routes.
- Added Tapzy user block/unblock support in chat settings and the Settings blocked-users panel.
