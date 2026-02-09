/**
 * Clearance Radar Monitor (Walmart + Kohl's)
 * Option A: Kohl's Clearance-only
 *
 * Runs in GitHub Actions on a schedule and posts results to Discord via webhook.
 * Goal: Run fast, never hang, and always send a useful Discord message each run.
 */

const webhook = process.env.DISCORD_WEBHOOK_URL;

const MAX_ITEMS_PER_STORE = 5;
const TIMEOUT_MS = 20000; // hard timeout per fetch to avoid hangs

function withTimeoutFetch(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

function safeText(s) {
  if (!s) return "";
  return String(s).replace(/\s+/g, " ").trim();
}

function formatMoney(val) {
  if (val == null) return "";
  const n = Number(val);
  if (Number.isFinite(n)) return `$${n.toFixed(2)}`;
  return String(val);
}

function truncateForDiscord(text, limit = 1900) {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 10) + "\n…(trimmed)";
}

async function postToDiscord(content) {
  const res = await withTimeoutFetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  }, 15000);

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${safeText(txt)}`);
  }
}

/**
 * WALMART (simple “clearance” search scrape)
 * NOTE: Walmart HTML is dynamic; this tries multiple JSON-ish patterns.
 */
async function fetchWalmartClearance() {
  const url = "https://www.walmart.com/search?q=clearance&sort=price_low";

  const res = await withTimeoutFetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (GitHub Actions) ClearanceRadar/1.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
  });

  if (!res.ok) throw new Error(`Walmart fetch failed: ${res.status}`);
  const html = await res.text();

  // Pattern tries:
  // - name/title fields
  // - price fields
  // - canonicalUrl or productPageUrl
  const items = [];

  // Try canonicalUrl pattern
  const rx1 = /"name":"([^"]+?)".{0,400}?"price":\{"price":([0-9.]+).{0,400}?"canonicalUrl":"([^"]+?)"/g;
  let m;
  while ((m = rx1.exec(html)) !== null && items.length < 30) {
    const name = safeText(m[1]);
    const price = formatMoney(m[2]);
    const path = m[3].startsWith("http") ? m[3] : `https://www.walmart.com${m[3]}`;
    if (name && price && path) items.push({ name, price, link: path });
  }

  // Fallback: productPageUrl
  const rx2 = /"name":"([^"]+?)".{0,600}?"price":\{"price":([0-9.]+).{0,600}?"productPageUrl":"([^"]+?)"/g;
  while ((m = rx2.exec(html)) !== null && items.length < 30) {
    const name = safeText(m[1]);
    const price = formatMoney(m[2]);
    const path = m[3].startsWith("http") ? m[3] : `https://www.walmart.com${m[3]}`;
    if (name && price && path) items.push({ name, price, link: path });
  }

  // De-dupe by link
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    if (!it.link || seen.has(it.link)) continue;
    seen.add(it.link);
    deduped.push(it);
    if (deduped.length >= MAX_ITEMS_PER_STORE) break;
  }

  return deduped;
}

/**
 * KOHL'S (Clearance-only catalog page scrape)
 * Kohl's is also dynamic; we parse embedded JSON-ish blobs when present.
 */
async function fetchKohlsClearance() {
  // Clearance catalog page
  const url = "https://www.kohls.com/catalog/clearance.jsp?CN=Promotions:Clearance";

  const res = await withTimeoutFetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (GitHub Actions) ClearanceRadar/1.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
  });

  if (!res.ok) throw new Error(`Kohl's fetch failed: ${res.status}`);
  const html = await res.text();

  const items = [];

  // Common-ish fields found in various Kohl's page payloads:
  // "productTitle" / "title"
  // "salePrice" / "regularPrice" / "price"
  // "productSeoUrl" / "seoUrl" / "/product/..."
  //
  // Try to catch a URL + title + price near each other
  const rx = /"productTitle":"([^"]+?)".{0,800}?"productSeoUrl":"([^"]+?)".{0,800}?(?:"salePrice":\{"minPrice":([0-9.]+)|"salePrice":([0-9.]+)|"price":([0-9.]+))/g;

  let m;
  while ((m = rx.exec(html)) !== null && items.length < 30) {
    const name = safeText(m[1]);
    const seo = m[2];
    const rawPrice = m[3] || m[4] || m[5];
    const price = formatMoney(rawPrice);

    let link = "";
    if (seo) {
      link = seo.startsWith("http") ? seo : `https://www.kohls.com${seo.startsWith("/") ? "" : "/"}${seo}`;
    }

    if (name && price && link) items.push({ name, price, link });
  }

  // Fallback pattern: sometimes "seoUrl" appears
  const rx2 = /"productTitle":"([^"]+?)".{0,800}?"seoUrl":"([^"]+?)".{0,800}?(?:"salePrice":\{"minPrice":([0-9.]+)|"salePrice":([0-9.]+)|"price":([0-9.]+))/g;
  while ((m = rx2.exec(html)) !== null && items.length < 30) {
    const name = safeText(m[1]);
    const seo = m[2];
    const rawPrice = m[3] || m[4] || m[5];
    const price = formatMoney(rawPrice);

    let link = "";
    if (seo) {
      link = seo.startsWith("http") ? seo : `https://www.kohls.com${seo.startsWith("/") ? "" : "/"}${seo}`;
    }

    if (name && price && link) items.push({ name, price, link });
  }

  // De-dupe by link
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    if (!it.link || seen.has(it.link)) continue;
    seen.add(it.link);
    deduped.push(it);
    if (deduped.length >= MAX_ITEMS_PER_STORE) break;
  }

  return deduped;
}

function buildMessage({ walmart, kohls }) {
  const now = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });

  let message = `🟢 **Clearance Radar Ran Successfully**\n`;
  message += `Run time: ${now}\n\n`;

  const anyFound = (walmart?.length || 0) + (kohls?.length || 0) > 0;

  if (!anyFound) {
    message += `No clearance items found this run.`;
    return message;
  }

  if (walmart?.length) {
    message += `🛒 **Walmart (Clearance Search)**\n`;
    for (const it of walmart) {
      message += `• **${it.name}** — ${it.price}\n${it.link}\n`;
    }
    message += `\n`;
  } else {
    message += `🛒 **Walmart**\n• No items found.\n\n`;
  }

  if (kohls?.length) {
    message += `🏷️ **Kohl's (Clearance)**\n`;
    for (const it of kohls) {
      message += `• **${it.name}** — ${it.price}\n${it.link}\n`;
    }
    message += `\n`;
  } else {
    message += `🏷️ **Kohl's**\n• No items found.\n\n`;
  }

  return truncateForDiscord(message);
}

async function run() {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  // Fetch both stores (sequential to keep it simple + reliable)
  let walmart = [];
  let kohls = [];

  try {
    walmart = await fetchWalmartClearance();
  } catch (e) {
    // Still send a message even if one store fails
    walmart = [];
    console.error("Walmart error:", e?.message || e);
  }

  try {
    kohls = await fetchKohlsClearance();
  } catch (e) {
    kohls = [];
    console.error("Kohl's error:", e?.message || e);
  }

  const msg = buildMessage({ walmart, kohls });
  await postToDiscord(msg);

  console.log("✅ Clearance Radar alert sent");
}

run().catch((err) => {
  console.error("❌", err?.message || err);
  process.exit(1);
});
