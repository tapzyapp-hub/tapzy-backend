const DEFAULT_TIME_ZONE = "America/Toronto";
const DEFAULT_HOUR = 0;
const DEFAULT_MINUTE = 0;

let timer = null;
let safetyInterval = null;
let running = false;
let started = false;
let lastSuccessfulLocalDateKey = "";
let lastAttemptLocalDateKey = "";

function envFlag(name, fallback = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return !["false", "0", "no", "off"].includes(String(raw).trim().toLowerCase());
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getLocalDateKey(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return localAsUtc - date.getTime();
}

function zonedLocalTimeToUtc(parts, timeZone) {
  let utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second || 0,
    0
  );

  // Re-run the offset conversion so DST boundary days still land correctly.
  for (let i = 0; i < 3; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    utcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second || 0,
      0
    ) - offsetMs;
  }

  return new Date(utcMs);
}

function addLocalDays(parts, days) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function getNextDailyRunDate(now = new Date(), options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const hour = Number.isInteger(options.hour) ? options.hour : DEFAULT_HOUR;
  const minute = Number.isInteger(options.minute) ? options.minute : DEFAULT_MINUTE;

  const localNow = getZonedParts(now, timeZone);
  let targetDate = {
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
  };

  let candidate = zonedLocalTimeToUtc(
    { ...targetDate, hour, minute, second: 0 },
    timeZone
  );

  if (candidate.getTime() <= now.getTime()) {
    targetDate = addLocalDays(targetDate, 1);
    candidate = zonedLocalTimeToUtc(
      { ...targetDate, hour, minute, second: 0 },
      timeZone
    );
  }

  return candidate;
}

async function runScheduledEventSync(reason = "scheduled") {
  if (running) {
    console.log("Daily event auto-refresh skipped because a sync is already running.");
    return 0;
  }

  const timeZone = process.env.EVENT_AUTO_REFRESH_TIME_ZONE || DEFAULT_TIME_ZONE;
  const todayKey = getLocalDateKey(new Date(), timeZone);

  running = true;
  lastAttemptLocalDateKey = todayKey;

  try {
    console.log(`Daily event auto-refresh started (${reason}).`);
    const { syncRealEvents } = require("./eventSyncService");
    const count = await syncRealEvents();
    lastSuccessfulLocalDateKey = todayKey;
    console.log(`Daily event auto-refresh complete. Synced ${count} events.`);
    return count;
  } catch (err) {
    console.error("Daily event auto-refresh failed:", err?.message || err);
    return 0;
  } finally {
    running = false;
  }
}

function shouldCatchUpAfterMissedTimer(now = new Date()) {
  const timeZone = process.env.EVENT_AUTO_REFRESH_TIME_ZONE || DEFAULT_TIME_ZONE;
  const hour = numberEnv("EVENT_AUTO_REFRESH_HOUR", DEFAULT_HOUR);
  const minute = numberEnv("EVENT_AUTO_REFRESH_MINUTE", DEFAULT_MINUTE);
  const localNow = getZonedParts(now, timeZone);
  const todayKey = getLocalDateKey(now, timeZone);

  const scheduledTimeHasPassed =
    localNow.hour > hour || (localNow.hour === hour && localNow.minute >= minute);

  return (
    scheduledTimeHasPassed &&
    lastSuccessfulLocalDateKey !== todayKey &&
    lastAttemptLocalDateKey !== todayKey &&
    !running
  );
}

function triggerEventAutoRefreshIfDue(reason = "request-catch-up") {
  const disabled = String(process.env.EVENT_AUTO_REFRESH_ENABLED || "true").toLowerCase() === "false";
  if (disabled) return false;

  if (!shouldCatchUpAfterMissedTimer()) return false;

  // Do not block the page/feed request. The next refresh/page load will see new events.
  setImmediate(() => {
    runScheduledEventSync(reason).catch((err) => {
      console.error("Daily event auto-refresh catch-up failed:", err?.message || err);
    });
  });

  return true;
}

function scheduleNextRun() {
  const timeZone = process.env.EVENT_AUTO_REFRESH_TIME_ZONE || DEFAULT_TIME_ZONE;
  const hour = numberEnv("EVENT_AUTO_REFRESH_HOUR", DEFAULT_HOUR);
  const minute = numberEnv("EVENT_AUTO_REFRESH_MINUTE", DEFAULT_MINUTE);
  const nextRun = getNextDailyRunDate(new Date(), { timeZone, hour, minute });
  const delayMs = Math.max(1000, nextRun.getTime() - Date.now());

  if (timer) clearTimeout(timer);

  console.log(
    `Next daily event auto-refresh scheduled for ${nextRun.toISOString()} (${timeZone} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}).`
  );

  timer = setTimeout(async () => {
    await runScheduledEventSync("timer");
    scheduleNextRun();
  }, delayMs);

  if (typeof timer.unref === "function") timer.unref();
}

function startEventAutoRefreshScheduler() {
  if (started) {
    console.log("Daily event auto-refresh scheduler already started.");
    return;
  }

  const disabled = String(process.env.EVENT_AUTO_REFRESH_ENABLED || "true").toLowerCase() === "false";
  if (disabled) {
    console.log("Daily event auto-refresh is disabled by EVENT_AUTO_REFRESH_ENABLED=false.");
    return;
  }

  started = true;

  const timeZone = process.env.EVENT_AUTO_REFRESH_TIME_ZONE || DEFAULT_TIME_ZONE;
  const hour = numberEnv("EVENT_AUTO_REFRESH_HOUR", DEFAULT_HOUR);
  const minute = numberEnv("EVENT_AUTO_REFRESH_MINUTE", DEFAULT_MINUTE);
  console.log(
    `Daily event auto-refresh scheduler started (${timeZone} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}).`
  );

  scheduleNextRun();

  // Hosting providers can sleep/restart apps and miss the exact midnight timer.
  // Run once on startup by default so Events is fresh after deploys/wakeups too.
  if (envFlag("EVENT_AUTO_REFRESH_ON_STARTUP", true)) {
    setImmediate(() => {
      runScheduledEventSync("startup").catch((err) => {
        console.error("Daily event auto-refresh startup failed:", err?.message || err);
      });
    });
  }

  // Safety net: Render/free hosts can pause, restart, or miss long setTimeout timers.
  // This small check makes the auto-refresh self-healing without waiting for a request.
  const checkMinutes = Math.max(1, numberEnv("EVENT_AUTO_REFRESH_CHECK_MINUTES", 15));
  safetyInterval = setInterval(() => {
    if (!shouldCatchUpAfterMissedTimer()) return;
    runScheduledEventSync("safety-check").catch((err) => {
      console.error("Daily event auto-refresh safety check failed:", err?.message || err);
    });
  }, checkMinutes * 60 * 1000);

  if (typeof safetyInterval.unref === "function") safetyInterval.unref();
}

module.exports = {
  startEventAutoRefreshScheduler,
  triggerEventAutoRefreshIfDue,
  runScheduledEventSync,
  getNextDailyRunDate,
  getLocalDateKey,
};
