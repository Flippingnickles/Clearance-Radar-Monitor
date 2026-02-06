const webhook = process.env.DISCORD_WEBHOOK_URL;

function pctOff(was, now) {
  if (!was || !now) return 0;
  return Math.round(((was - now) / was) * 100);
}

async function run() {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  // Walmart "Clearance" search page (contains embedded JSON in many cases)
  const url = "https://www.walmart.com/search?q=clearance";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html",
    },
  });

  if (!res.ok) throw new Error(`Walmart fetch failed: ${res.status}`);

  const html = await res.text();

  // Extract basic product fields from embedded JSON fragments
  // NOTE: Walmart changes markup sometimes; this is a lightweight parser.
  const regex = /"name":"([^"]+?)".+?"price":\{"price":([0-9.]+).+?"canonicalUrl":"([^"]+?)"/g;

  const items = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const name = m[1].replace(/\\u0026/g, "&");
    const price = Number(m[2]);
    const path = m[3].replace(/\\u002F/g, "/");
    const link = path.startsWith("http") ? path : `https://www.walmart.com${path}`;

    // Basic de-dupe
    if (!items.find((x) => x.link === link)) {
      items.push({ name, price, link });
    }
    if (items.length >= 40) break; // keep small
  }

  if (items.length === 0) {
    console.log("No products parsed from Walmart page.");
    return;
  }

  // Send top 10 cheapest as a starting “deal radar”
  items.sort((a, b) => a.price - b.price);
  const top = items.slice(0, 10);

  let message = `🔥 **Walmart Clearance Scan (Top 10 cheapest)**\n\n`;
  for (const it of top) {
    message += `• **${it.name}** — $${it.price}\n${it.link}\n\n`;
  }

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });

  console.log("Walmart clearance alert sent");
}

run().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
