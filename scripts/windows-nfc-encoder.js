#!/usr/bin/env node
/*
 * Tapzy Windows NFC Encoder
 *
 * Hardware target: PC/SC USB NFC writers such as ACR122U.
 * Tag target: NFC Forum Type 2 tags/cards such as NTAG213/215/216.
 *
 * Setup:
 *   npm install nfc-pcsc
 *
 * Run:
 *   set TAPZY_BASE_URL=https://tapzy.org
 *   set TAPZY_ADMIN_KEY=your_admin_key
 *   node scripts/windows-nfc-encoder.js
 */

const readline = require("readline");

function requireNfcPcsc() {
  try {
    return require("nfc-pcsc");
  } catch (_) {
    console.error("");
    console.error("Missing NFC writer dependency.");
    console.error("Run this once in the project folder:");
    console.error("  npm install nfc-pcsc");
    console.error("");
    process.exit(1);
  }
}

const { NFC } = requireNfcPcsc();

const BASE_URL = String(process.env.TAPZY_BASE_URL || "https://tapzy.org").replace(/\/$/, "");
const ADMIN_KEY = String(process.env.TAPZY_ADMIN_KEY || "").trim();

if (!ADMIN_KEY) {
  console.error("Missing TAPZY_ADMIN_KEY.");
  console.error("Set it first:");
  console.error("  set TAPZY_ADMIN_KEY=your_admin_key");
  process.exit(1);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiUrl(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE_URL}${path}${sep}key=${encodeURIComponent(ADMIN_KEY)}`;
}

async function getNextCard() {
  const response = await fetch(apiUrl("/admin/encoder/next.json"));
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Tapzy returned ${response.status}`);
  }
  return data;
}

async function markEncoded(code) {
  const response = await fetch(apiUrl(`/admin/encoder/${encodeURIComponent(code)}/encoded`), {
    method: "POST",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Tapzy returned ${response.status}`);
  }
  return data;
}

function encodeNdefUri(url) {
  const uri = Buffer.from(String(url || ""), "utf8");
  const payloadLength = uri.length + 1;
  if (payloadLength > 255) throw new Error("URL is too long for this simple encoder.");

  return Buffer.concat([
    Buffer.from([0xd1, 0x01, payloadLength, 0x55, 0x00]),
    uri,
  ]);
}

function encodeType2TagPayload(url) {
  const ndef = encodeNdefUri(url);
  const tlv = Buffer.concat([Buffer.from([0x03, ndef.length]), ndef, Buffer.from([0xfe])]);
  const paddedLength = Math.ceil(tlv.length / 4) * 4;
  return Buffer.concat([tlv, Buffer.alloc(paddedLength - tlv.length)]);
}

async function writeType2Tag(reader, url) {
  const payload = encodeType2TagPayload(url);
  const pages = payload.length / 4;
  if (pages > 130) {
    throw new Error("URL payload is too large for common NTAG cards.");
  }

  for (let i = 0; i < pages; i += 1) {
    const page = 4 + i;
    const chunk = payload.subarray(i * 4, i * 4 + 4);
    await reader.write(page, chunk, 4);
    await wait(12);
  }
}

function promptEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

let busy = false;
let latestReader = null;

async function handleCard(reader) {
  if (busy) return;
  busy = true;

  try {
    const next = await getNextCard();
    if (next.done) {
      console.log("All Tapzy cards are encoded. Nice.");
      return;
    }

    const card = next.card;
    console.log("");
    console.log(`Encoding card ${Math.min(next.encoded + 1, next.total)} / ${next.total}`);
    console.log(`Code: ${card.code}`);
    console.log(`URL:  ${card.url}`);

    await writeType2Tag(reader, card.url);
    await markEncoded(card.code);

    console.log(`Success: ${card.code} written and marked encoded.`);
    console.log("Remove this card, then place the next blank card on the writer.");
  } catch (error) {
    console.error("");
    console.error("Write failed:", error.message || error);
    console.error("Remove the card, check it is a blank NTAG card, then try again.");
  } finally {
    await wait(750);
    busy = false;
  }
}

console.log("");
console.log("Tapzy Windows NFC Encoder");
console.log(`Server: ${BASE_URL}`);
console.log("Waiting for a USB NFC writer...");
console.log("");

const nfc = new NFC();

nfc.on("reader", (reader) => {
  latestReader = reader;
  console.log(`Reader ready: ${reader.reader.name}`);
  console.log("Place a blank NFC card on the reader.");

  reader.autoProcessing = false;

  reader.on("card", () => {
    handleCard(reader);
  });

  reader.on("error", (error) => {
    console.error("Reader error:", error.message || error);
  });

  reader.on("end", () => {
    if (latestReader === reader) latestReader = null;
    console.log(`Reader removed: ${reader.reader.name}`);
  });
});

nfc.on("error", (error) => {
  console.error("NFC error:", error.message || error);
});

process.on("SIGINT", async () => {
  console.log("");
  console.log("Stopping Tapzy encoder.");
  await promptEnter("Press Enter to close...");
  process.exit(0);
});
