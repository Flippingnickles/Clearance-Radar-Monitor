/**
 * Clearance Radar Monitor
 * Sources:
 * - Walmart (existing)
 * - Kohl's (added)
 *
 * Behavior:
 * - Runs every 30 minutes via GitHub Actions
 * - Sends Discord message for each source (heartbeat if none found)
 * - Hard timeouts to prevent hanging runs
 */

const webhook = process.env.DISCORD_WEBHOOK_URL;

if (!webhook) {
  console.error("❌ DISCORD_WEBHOOK_URL not set");
  process.exit(1);
}

async function postToDiscord(content) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${text}`);
  }
}

async function fetchHtml(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (GitHub Actions) ClearanceRadar/1.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: "timeout_or_block", text: String(e?.message || e) };
  } finally {
    clearTimeout(timeout);
  }
}

// -------------------------
// WALMART
// -------------------------
function parseWalmart(html) {
  const regex =
    /"name":"([^"]+?)".*?"price":\{"price":([0-9.]+).*?"canonicalUrl":"([^"]+?)"/g;

  const matches = [...html.matchAll(regex)];
  const items = [];

  for (const m of matches.slice(0, 6)) {
    const name = m[1];
    const price = Number(m[2]);
    const path = m[3];
    const link = path.startsWith("http") ? path : `https://www.walmart.com${path}`;

    if (!name || !Number.isFinite(price) || !link) continue;
    items.push({ name, price, link });
  }

  return items;
}

// -------------------------
// KOHLS
// -------------------------
// We will monitor Kohl's clearance page and try to extract item links + prices.
// Kohl's markup changes, so we parse conservatively and fall back to heartbeat.
function parseKohls(html) {
  const items = [];

  // Try to grab "productTitle" and price patterns that appear in embedded JSON or HTML.
  // Example patterns we attempt:
  // "productTitle":"...","salePrice":"..."
  // or "productTitle":"...","price":"..."
  const reA = /"productTitle":"([^"]{3,160})".{0,500}?"salePrice":"?\$?([0-9.]+)"?/g;
  const reB = /"productTitle":"([^"]{3,160})".{0,500}?"price":"?\$?([0-9.]+)"?/g;
  const reUrl = /"pdpUrl":"([^"]{5,220})"/g;

  const titlesA = [...html.matchAll(reA)];
  const titlesB = [...html.matchAll(reB)];
  const urls = [...html.matchAll(reUrl)].map((m) => m[1]);

  const candidates = titlesA.length ? titlesA : titlesB;

  for (let i = 0; i < Math.min(6, candidates.length); i++) {
    const title = candidates[i][1]
      .replace(/\\u002F/g, "/")
      .replace(/\s+/g, " ")
      .trim();
    const priceNum = Number(candidates[i][2]);

    const rawUrl = urls[i] || "";
    let link = rawUrl.replace(/\\u002F/g, "/");
    if (link && !link.startsWith("http")) link = `https://www.kohls.com${link}`;

    if (!title || !Number.isFinite(priceNum)) continue;

    items.push({
      name: title,
      price: priceNum,
      link: link || "https://www.kohls.com/sale-event/clearance.jsp",
    });
  }

  return items;
}

async function runSource({ label, url, parser }) {
  const { ok, status, text } = await fetchHtml(url, 20000);

  if (!ok) {
    await postToDiscord(
      `🟠 **${label} Radar Ran**\nFetch issue: **${status}**\nLink: ${url}`
    );
    return;
  }

  const items = parser(text);

  if (!items.length) {
    await postToDiscord(
      `🟢 **${label} Radar Ran Successfully**\nNo clearance items found this run.\nLink: ${url}`
    );
    return;
  }

  let msg = `🔥 **${label} Clearance Detected** 🔥\n\n`;
  for (const it of items) {
    msg += `• **$${it.price.toFixed(2)}** — ${it.name}\n${it.link}\n\n`;
  }

  await postToDiscord(msg.trim());
}

async function run() {
  // Hard exit so nothing hangs
  const hard = setTimeout(() => {
    console.error("❌ Hard timeout hit — exiting.");
    process.exit(1);
  }, 60000);

  try {
    await runSource({
      label: "Walmart",
      url: "https://www.walmart.com/search?q=clearance&sort=price_low",
      parser: parseWalmart,
    });

    await runSource({
      label: "Kohl's",
      url: "https://www.kohls.com/sale-event/clearance.jsp",
      parser: parseKohls,
    });
  } finally {
    clearTimeout(hard);
  }

  process.exit(0);
}

run().catch(async (err) => {
  console.error("❌", err?.message || err);
  try {
    await postToDiscord(`🔴 **Clearance Radar Error**\n\`${String(err?.message || err)}\``);
  } catch {}
  process.exit(1);
});
