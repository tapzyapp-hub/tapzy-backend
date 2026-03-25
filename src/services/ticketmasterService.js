const TM_API_KEY = process.env.TICKETMASTER_API_KEY || "";



function text(value) {

  return String(value || "").trim();

}



function numberOrNull(value) {

  const n = Number(value);

  return Number.isFinite(n) ? n : null;

}



function toTicketmasterDate(date) {

  const d = new Date(date);

  return d.toISOString().replace(/\.\d{3}Z$/, "Z");

}



function buildUrl(params = {}) {

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");



  url.searchParams.set("apikey", TM_API_KEY);

  url.searchParams.set("countryCode", params.countryCode || "CA");

  url.searchParams.set("size", String(params.size || 50));

  url.searchParams.set("sort", "date,asc");



  if (params.city) url.searchParams.set("city", params.city);

  if (params.keyword) url.searchParams.set("keyword", params.keyword);

  if (params.classificationName) {

    url.searchParams.set("classificationName", params.classificationName);

  }

  if (params.startDateTime) {

    url.searchParams.set("startDateTime", params.startDateTime);

  }

  if (params.endDateTime) {

    url.searchParams.set("endDateTime", params.endDateTime);

  }



  return url.toString();

}



function pickBestImage(images = []) {

  if (!Array.isArray(images) || !images.length) return "";



  const sorted = [...images].sort((a, b) => {

    const aScore =

      (Number(a?.width) || 0) * (Number(a?.height) || 0) +

      (a?.ratio === "16_9" ? 1000000 : 0);

    const bScore =

      (Number(b?.width) || 0) * (Number(b?.height) || 0) +

      (b?.ratio === "16_9" ? 1000000 : 0);

    return bScore - aScore;

  });



  return text(sorted[0]?.url);

}



function formatPrice(item) {

  const price = item?.priceRanges?.[0];

  if (!price) return "";



  const currency = text(price.currency || "");

  const min = price.min != null ? Number(price.min) : null;

  const max = price.max != null ? Number(price.max) : null;



  if (min == null && max == null) return "";

  if (min != null && max != null && min !== max) {

    return `${currency} ${min} - ${max}`.trim();

  }

  return `${currency} ${min ?? max}`.trim();

}



function categoryFromItem(item) {

  const classifications = Array.isArray(item?.classifications) ? item.classifications : [];

  const first = classifications[0] || {};



  const segment = text(first?.segment?.name);

  const genre = text(first?.genre?.name);

  const subGenre = text(first?.subGenre?.name);



  return genre || subGenre || segment || "Event";

}



function mapTicketmasterEvent(item) {

  const venue = item?._embedded?.venues?.[0] || {};



  const startAt = item?.dates?.start?.dateTime

    ? new Date(item.dates.start.dateTime)

    : item?.dates?.start?.localDate

      ? new Date(`${item.dates.start.localDate}T19:00:00`)

      : null;



  const city = text(venue?.city?.name);

  const region = text(venue?.state?.name || venue?.state?.stateCode);

  const country = text(venue?.country?.name || venue?.country?.countryCode || "Canada");

  const latitude = numberOrNull(venue?.location?.latitude);

  const longitude = numberOrNull(venue?.location?.longitude);



  return {

    source: "ticketmaster",

    sourceEventId: text(item?.id),

    title: text(item?.name || "Untitled Event"),

    description: text(item?.info || item?.pleaseNote || ""),

    imageUrl: pickBestImage(item?.images),

    venueName: text(venue?.name),

    address: [

      text(venue?.address?.line1),

      city,

      region,

      country,

    ].filter(Boolean).join(", "),

    city,

    region,

    country,

    eventUrl: text(item?.url),

    ticketUrl: text(item?.url),

    category: categoryFromItem(item),

    startAt,

    endAt: null,

    latitude,

    longitude,

    priceText: formatPrice(item),

    rawPayload: item,

  };

}



function dedupe(events) {

  const seen = new Set();

  const out = [];



  for (const event of events) {

    const id = `${event.source}:${event.sourceEventId}`;

    if (!event.sourceEventId || seen.has(id)) continue;

    seen.add(id);

    out.push(event);

  }



  return out;

}



function futureWindow() {

  const start = new Date();

  start.setHours(0, 0, 0, 0);



  const end = new Date(start);

  end.setDate(end.getDate() + 45);

  end.setHours(23, 59, 59, 0);



  return {

    startDateTime: toTicketmasterDate(start),

    endDateTime: toTicketmasterDate(end),

  };

}



function delay(ms) {

  return new Promise((resolve) => setTimeout(resolve, ms));

}



async function fetchOne(url) {

  const response = await fetch(url);



  if (!response.ok) {

    const body = await response.text().catch(() => "");



    if (response.status === 429) {

      console.error("Ticketmaster rate limit hit:", body.slice(0, 500));

    } else {

      console.error("Ticketmaster error:", response.status, body.slice(0, 500));

    }



    return [];

  }



  const json = await response.json();

  return Array.isArray(json?._embedded?.events) ? json._embedded.events : [];

}



async function fetchTicketmasterEvents(options = {}) {

  if (!TM_API_KEY) {

    console.error("Ticketmaster key missing");

    return [];

  }



  const cities = Array.isArray(options.cities) && options.cities.length

    ? options.cities

    : ["Toronto", "Barrie", "Vaughan", "Mississauga", "Ottawa"];



  const keywords = Array.isArray(options.keywords) && options.keywords.length

    ? options.keywords

    : ["networking", "tech", "music"];



  const windowParams = futureWindow();

  const all = [];



  console.log(

    "Ticketmaster sync window:",

    windowParams.startDateTime,

    "to",

    windowParams.endDateTime

  );



  for (const city of cities.slice(0, 5)) {

    try {

      const cityUrl = buildUrl({

        city,

        countryCode: "CA",

        size: 50,

        ...windowParams,

      });



      const cityItems = await fetchOne(cityUrl);

      console.log(`Ticketmaster city "${city}" events:`, cityItems.length);



      for (const item of cityItems) {

        try {

          all.push(mapTicketmasterEvent(item));

        } catch (err) {

          console.error("Ticketmaster map error:", err?.message || err);

        }

      }



      await delay(1500);



      for (const keyword of keywords) {

        const keywordUrl = buildUrl({

          city,

          keyword,

          countryCode: "CA",

          size: 25,

          ...windowParams,

        });



        const keywordItems = await fetchOne(keywordUrl);

        console.log(`Ticketmaster city "${city}" keyword "${keyword}" events:`, keywordItems.length);



        for (const item of keywordItems) {

          try {

            all.push(mapTicketmasterEvent(item));

          } catch (err) {

            console.error("Ticketmaster keyword map error:", err?.message || err);

          }

        }



        await delay(1500);

      }

    } catch (err) {

      console.error(`Ticketmaster fetch failed for ${city}:`, err?.message || err);

    }

  }



  const deduped = dedupe(all).filter((event) => {

    if (!event.title || !event.sourceEventId) return false;

    if (!event.startAt) return true;

    return event.startAt.getTime() >= Date.now() - 6 * 60 * 60 * 1000;

  });



  console.log("Ticketmaster raw events:", all.length);

  console.log("Ticketmaster deduped events:", deduped.length);



  return deduped;

}



module.exports = {

  fetchTicketmasterEvents,

};