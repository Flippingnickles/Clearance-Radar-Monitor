// monitor.js
// Checks Walmart + Target for "clearance" search results (lightweight)
// Posts top results to Discord webhook if found.
// IMPORTANT: This is a simple starter. Some sites may block bots sometimes.

const webhook = process.env.DISCORD_WEBHOOK_URL;

function timeoutFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

function cleanText(s) {
  return String(s || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function postToDiscord(content) {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  const res = await timeoutFetch(
    webhook,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
    15000
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord error: ${res.status} ${text}`);
  }
}

async function scrapeWalmart() {
  const url = "https://www.walmart.com/search?q=clearance";
  const res = await timeoutFetch(
    url,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (GitHub Actions) ClearanceRadar/1.0",
        "Accept": "text/html",
      },
    },
    15000
  );

  if (!res.ok) {
    return { ok: false, store: "Walmart", error: `HTTP ${res.status}` };
  }

  const html = await res.text();

  // Pull a few name/price/url-ish matches from embedded JSON patterns
  // This is intentionally simple.
  const regex = /"name":"([^"]+)".{0,200}?"price":\{"price":([0-9.]+).{0,200}?"canonicalUrl":"([^"]+)"/g;
  const matches = [...html.matchAll(regex)];

  if (matches.length === 0) {
    return { ok: true, store: "Walmart", items: [] };
  }

  const items = matches.slice(0, 5).map((m) => {
    const name = cleanText(m[1]);
    const price = m[2];
    const path = m[3].startsWith("http") ? m[3] : `https://www.walmart.com${m[3]}`;
    return { name, price: `$${price}`, link: path };
  });

  return { ok: true, store: "Walmart", items };
}

async function scrapeTarget() {
  // Target can be stricter about bot traffic. This is a lightweight first pass.
  const url = "https://www.target.com/s?searchTerm=clearance";
  const res = await timeoutFetch(
    url,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (GitHub Actions) ClearanceRadar/1.0",
        "Accept": "text/html",
      },
    },
    15000
  );

  if (!res.ok) {
    return { ok: false, store: "Target", error: `HTTP ${res.status}` };
  }

  const html = await res.text();

  // Try to grab some product-ish data out of the page.
  // Target markup changes often; this is a starter.
  const regex = /"title":"([^"]+)".{0,250}?"formatted_current_price":"([^"]+)".{0,250}?"url":"([^"]+)"/g;
  const matches = [...html.matchAll(regex)];

  if (matches.length === 0) {
    // If Target blocks, you often still get HTML but no useful product JSON.
    return { ok: true, store: "Target", items: [] };
  }

  const items = matches.slice(0, 5).map((m) => {
    const name = cleanText(m[1]);
    const price = cleanText(m[2]);
    const path = cleanText(m[3]);
    const link = path.startsWith("http") ? path : `https://www.target.com${path}`;
    return { name, price, link };
  });

  return { ok: true, store: "Target", items };
}

async function run() {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  const results = await Promise.allSettled([scrapeWalmart(), scrapeTarget()]);

  const sections = [];
  const errors = [];

  for (const r of results) {
    if (r.status === "rejected") {
      errors.push(`⚠️ Scrape failed: ${r.reason?.message || r.reason}`);
      continue;
    }
    const data = r.value;
    if (!data.ok) {
      errors.push(`⚠️ ${data.store} blocked/failed: ${data.error}`);
      continue;
    }
    if (data.items.length > 0) {
      const lines = data.items.map((it) => `• **${it.name}** — ${it.price}\n${it.link}`);
      sections.push(`🛒 **${data.store} Deals**\n${lines.join("\n")}`);
    }
  }

  // Only alert if we found items. (Keeps Discord clean.)
  if (sections.length === 0) {
    console.log("No deals detected this run.");
    if (errors.length) console.log(errors.join("\n"));
    return;
  }

  const message =
    `🔥 **Clearance Radar Hits**\n` +
    sections.join("\n\n") +
    (errors.length ? `\n\n${errors.join("\n")}` : "");

  await postToDiscord(message);
  console.log("✅ Posted clearance alert to Discord.");
}

run().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
