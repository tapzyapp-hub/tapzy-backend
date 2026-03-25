const EVENTBRITE_PRIVATE_TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN || "";



function text(value) {

  return String(value || "").trim();

}



function toIso(value) {

  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? null : d.toISOString();

}



function numberOrNull(value) {

  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? n : null;

}



function categoryFromEventbrite(event) {

  const name = text(event?.category?.name);

  const sub = text(event?.subcategory?.name);

  return sub || name || "Event";

}



function normalizeEventbriteEvent(event) {

  const id = text(event?.id);

  const name = text(event?.name?.text);



  if (!id || !name) return null;



  const address = event?.venue?.address || {};



  return {

    source: "eventbrite",

    sourceEventId: id,

    title: name,

    description: text(event?.summary) || text(event?.description?.text),

    imageUrl: text(event?.logo?.original?.url) || text(event?.logo?.url),

    venueName: text(event?.venue?.name),

    address: text(address?.localized_address_display) || text(address?.address_1),

    city: text(address?.city) || text(address?.localized_area_display),

    region: text(address?.region),

    country: text(address?.country) || "Canada",

    eventUrl: text(event?.url),

    ticketUrl: text(event?.url),

    category: categoryFromEventbrite(event),

    startAt: toIso(event?.start?.utc || event?.start?.local),

    endAt: toIso(event?.end?.utc || event?.end?.local),

    latitude: numberOrNull(address?.latitude),

    longitude: numberOrNull(address?.longitude),

    priceText: event?.is_free ? "Free" : "",

    rawPayload: event,

  };

}



async function fetchJson(url) {

  const res = await fetch(url, {

    headers: {

      Authorization: `Bearer ${EVENTBRITE_PRIVATE_TOKEN}`,

      Accept: "application/json",

    },

  });



  if (!res.ok) {

    const body = await res.text().catch(() => "");

    throw new Error(`Eventbrite ${res.status}: ${body.slice(0, 300)}`);

  }



  return res.json();

}



async function getMyOrganizations() {

  const json = await fetchJson("https://www.eventbriteapi.com/v3/users/me/organizations/");

  return Array.isArray(json?.organizations) ? json.organizations : [];

}



async function getOrganizationEvents(orgId) {

  const params = new URLSearchParams({

    status: "live",

    expand: "venue,category,subcategory,logo",

    page_size: "50",

  });



  const json = await fetchJson(

    `https://www.eventbriteapi.com/v3/organizations/${orgId}/events/?${params.toString()}`

  );



  return Array.isArray(json?.events) ? json.events : [];

}



async function fetchEventbriteEvents() {

  if (!EVENTBRITE_PRIVATE_TOKEN) {

    console.log("Eventbrite token missing");

    return [];

  }



  try {

    const orgs = await getMyOrganizations();

    console.log("Eventbrite organizations:", orgs.length);



    const all = [];

    const seen = new Set();



    for (const org of orgs) {

      const orgId = text(org?.id);

      if (!orgId) continue;



      const events = await getOrganizationEvents(orgId);

      console.log(`Eventbrite organization "${orgId}" events:`, events.length);



      for (const raw of events) {

        const normalized = normalizeEventbriteEvent(raw);

        if (!normalized) continue;



        const key = `${normalized.source}:${normalized.sourceEventId}`;

        if (seen.has(key)) continue;



        seen.add(key);

        all.push(normalized);

      }

    }



    console.log("Eventbrite raw events:", all.length);

    return all;

  } catch (err) {

    console.error("Eventbrite fetch failed:", err?.message || err);

    return [];

  }

}



module.exports = {

  fetchEventbriteEvents,

};