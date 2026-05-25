const { syncRealEvents } = require("./eventSyncService");

const DEFAULT_TIME_ZONE = "America/Toronto";
const DEFAULT_HOUR = 0;
const DEFAULT_MINUTE = 0;

let timer = null;
let running = false;
let started = false;

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

async function runScheduledEventSync() {
  if (running) {
    console.log("Daily event auto-refresh skipped because a sync is already running.");
    return;
  }

  running = true;
  try {
    console.log("Daily event auto-refresh started.");
    const count = await syncRealEvents();
    console.log(`Daily event auto-refresh complete. Synced ${count} events.`);
  } catch (err) {
    console.error("Daily event auto-refresh failed:", err?.message || err);
  } finally {
    running = false;
  }
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
    await runScheduledEventSync();
    scheduleNextRun();
  }, delayMs);

  if (typeof timer.unref === "function") timer.unref();
}

function startEventAutoRefreshScheduler() {
  if (started) return;

  const disabled = String(process.env.EVENT_AUTO_REFRESH_ENABLED || "true").toLowerCase() === "false";
  if (disabled) {
    console.log("Daily event auto-refresh is disabled by EVENT_AUTO_REFRESH_ENABLED=false.");
    return;
  }

  started = true;
  scheduleNextRun();
}

module.exports = {
  startEventAutoRefreshScheduler,
  getNextDailyRunDate,
};
