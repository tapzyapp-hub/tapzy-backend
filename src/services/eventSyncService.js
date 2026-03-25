const prisma = require("../prisma");

const { fetchTicketmasterEvents } = require("./ticketmasterService");

const { fetchEventbriteEvents } = require("./eventbriteService");



const PRIORITY_CITIES = [

  "Toronto",

  "Barrie",

  "Vaughan",

  "Mississauga",

  "Brampton",

  "Hamilton",

  "Ottawa",

  "Montreal",

  "Vancouver",

  "Calgary",

  "Edmonton",

  "Halifax",

];



const FALLBACK_CITIES = [

  "London",

  "Kitchener",

  "Waterloo",

  "Windsor",

  "Markham",

  "Richmond Hill",

  "Oakville",

  "Burlington",

  "Oshawa",

  "Kingston",

  "Guelph",

  "Quebec City",

  "Laval",

  "Victoria",

  "Kelowna",

  "Winnipeg",

  "Regina",

  "Saskatoon",

  "Moncton",

  "Charlottetown",

  "St. John's",

];



const ALL_CITIES = [...new Set([...PRIORITY_CITIES, ...FALLBACK_CITIES])];



function normalizeText(value) {

  return String(value || "").trim();

}



function normalizeUrl(value) {

  return String(value || "").trim();

}



function normalizeDate(value) {

  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? null : d;

}



function normalizeNumber(value) {

  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? n : null;

}



function safeJson(value) {

  if (!value || typeof value !== "object") return {};

  try {

    return JSON.parse(JSON.stringify(value));

  } catch {

    return {};

  }

}



function buildDedupKey(event) {

  const source = normalizeText(event.source).toLowerCase();

  const sourceEventId = normalizeText(event.sourceEventId).toLowerCase();

  if (source && sourceEventId) return `${source}:${sourceEventId}`;



  const title = normalizeText(event.title).toLowerCase();

  const city = normalizeText(event.city).toLowerCase();

  const venue = normalizeText(event.venueName).toLowerCase();

  const startAt = event.startAt ? new Date(event.startAt).toISOString() : "";

  return `fallback:${title}:${city}:${venue}:${startAt}`;

}



function sanitizeEvent(raw) {

  if (!raw || !raw.title || !raw.source) return null;



  const source = normalizeText(raw.source);

  const sourceEventId = normalizeText(raw.sourceEventId);



  if (!source || !sourceEventId) return null;



  const startAt = normalizeDate(raw.startAt);

  const endAt = normalizeDate(raw.endAt);



  return {

    source,

    sourceEventId,

    title: normalizeText(raw.title) || "Untitled Event",

    description: normalizeText(raw.description),

    imageUrl: normalizeUrl(raw.imageUrl),

    venueName: normalizeText(raw.venueName),

    address: normalizeText(raw.address),

    city: normalizeText(raw.city),

    region: normalizeText(raw.region),

    country: normalizeText(raw.country || "Canada"),

    eventUrl: normalizeUrl(raw.eventUrl),

    ticketUrl: normalizeUrl(raw.ticketUrl),

    category: normalizeText(raw.category || "Event"),

    startAt,

    endAt,

    latitude: normalizeNumber(raw.latitude),

    longitude: normalizeNumber(raw.longitude),

    priceText: normalizeText(raw.priceText),

    rawPayload: safeJson(raw.rawPayload),

  };

}



function makeDbEvent(event) {

  return {

    source: event.source,

    sourceEventId: event.sourceEventId,

    title: event.title,

    description: event.description || "",

    imageUrl: event.imageUrl || "",

    venueName: event.venueName || "",

    address: event.address || "",

    city: event.city || "",

    region: event.region || "",

    country: event.country || "",

    eventUrl: event.eventUrl || "",

    ticketUrl: event.ticketUrl || "",

    category: event.category || "Event",

    startAt:

      event.startAt instanceof Date && !Number.isNaN(event.startAt.getTime())

        ? event.startAt

        : null,

    endAt:

      event.endAt instanceof Date && !Number.isNaN(event.endAt.getTime())

        ? event.endAt

        : null,

    latitude: typeof event.latitude === "number" ? event.latitude : null,

    longitude: typeof event.longitude === "number" ? event.longitude : null,

    priceText: event.priceText || "",

    rawPayload: safeJson(event.rawPayload),

  };

}



async function upsertEvent(event) {

  const dbEvent = makeDbEvent(event);



  await prisma.eventFinderItem.upsert({

    where: {

      source_sourceEventId: {

        source: dbEvent.source,

        sourceEventId: dbEvent.sourceEventId,

      },

    },

    update: {

      title: dbEvent.title,

      description: dbEvent.description,

      imageUrl: dbEvent.imageUrl,

      venueName: dbEvent.venueName,

      address: dbEvent.address,

      city: dbEvent.city,

      region: dbEvent.region,

      country: dbEvent.country,

      eventUrl: dbEvent.eventUrl,

      ticketUrl: dbEvent.ticketUrl,

      category: dbEvent.category,

      startAt: dbEvent.startAt,

      endAt: dbEvent.endAt,

      latitude: dbEvent.latitude,

      longitude: dbEvent.longitude,

      priceText: dbEvent.priceText,

      rawPayload: dbEvent.rawPayload,

    },

    create: dbEvent,

  });

}



async function fetchTicketmasterBatches() {

  const batches = [PRIORITY_CITIES, ALL_CITIES];

  const collected = [];



  for (const cities of batches) {

    try {

      const events = await fetchTicketmasterEvents({ cities });

      if (Array.isArray(events) && events.length) {

        collected.push(...events);

      }

    } catch (err) {

      console.error("Ticketmaster fetch error:", err?.message || err);

    }

  }



  return collected;

}



async function fetchEventbriteBatches() {

  const batches = [{ cities: PRIORITY_CITIES }, { cities: ALL_CITIES }, {}];

  const collected = [];



  for (const options of batches) {

    try {

      const events = await fetchEventbriteEvents(options);

      if (Array.isArray(events) && events.length) {

        collected.push(...events);

      }

    } catch (err) {

      console.error("Eventbrite fetch error:", err?.message || err);

    }

  }



  return collected;

}



function dedupeEvents(rawEvents) {

  const map = new Map();



  for (const raw of rawEvents) {

    const event = sanitizeEvent(raw);

    if (!event) continue;



    if (event.startAt && event.startAt.getTime() < Date.now() - 6 * 60 * 60 * 1000) {

      continue;

    }



    const key = buildDedupKey(event);

    if (!map.has(key)) {

      map.set(key, event);

    }

  }



  return Array.from(map.values()).sort((a, b) => {

    const aTime = a.startAt ? a.startAt.getTime() : Number.MAX_SAFE_INTEGER;

    const bTime = b.startAt ? b.startAt.getTime() : Number.MAX_SAFE_INTEGER;

    return aTime - bTime;

  });

}



async function cleanupOldEvents() {

  await prisma.eventFinderItem.deleteMany({

    where: {

      source: { not: "tapzy_seed" },

      startAt: {

        not: null,

        lt: new Date(Date.now() - 12 * 60 * 60 * 1000),

      },

    },

  });

}



async function syncRealEvents() {

  console.log("Starting real events sync...");



  const [ticketmasterRaw, eventbriteRaw] = await Promise.all([

    fetchTicketmasterBatches(),

    fetchEventbriteBatches(),

  ]);



  console.log("Ticketmaster raw events:", ticketmasterRaw.length);

  console.log("Eventbrite raw events:", eventbriteRaw.length);



  const allEvents = dedupeEvents([...ticketmasterRaw, ...eventbriteRaw]).slice(0, 100);



  console.log("Deduped valid events:", allEvents.length);



  let count = 0;

  let failed = 0;



  for (const event of allEvents) {

    try {

      await upsertEvent(event);

      count += 1;



      if (count % 25 === 0) {

        console.log("Saved events so far:", count);

      }

    } catch (err) {

      failed += 1;



      console.error("Event upsert error:", {

        source: event.source,

        sourceEventId: event.sourceEventId,

        title: event.title,

        startAt: event.startAt,

        latitude: event.latitude,

        longitude: event.longitude,

        error: err?.message || err,

      });



      if (failed % 10 === 0) {

        console.log("Failed events so far:", failed);

      }

    }

  }



  await cleanupOldEvents();



  console.log("Real events sync complete. Upserted:", count, "Failed:", failed);



  return count;

}



module.exports = {

  syncRealEvents,

};