const webhook = process.env.DISCORD_WEBHOOK_URL;

async function run() {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  // Phase 2: Walmart online "clearance" scraper (simple + lightweight)
  const url = "https://www.walmart.com/search?q=clearance";

  const res = await fetch(url, {
    headers: {
      // Basic UA helps avoid some bot blocks
      "User-Agent": "Mozilla/5.0 (GitHub Actions) ClearanceRadar/1.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Walmart fetch failed: ${res.status}`);
  }

  const html = await res.text();

  // Look for product JSON-ish patterns on the page
  // We keep it simple: pull a handful of name/price/url matches if present.
  const regex = /"name":"([^"]+)".*?"price":\{"price":([0-9.]+).*?"
