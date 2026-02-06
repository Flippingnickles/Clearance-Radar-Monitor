const webhook = process.env.DISCORD_WEBHOOK_URL;

if (!webhook) {
  console.error("❌ DISCORD_WEBHOOK_URL not set");
  process.exit(1);
}

async function run() {
  const url = "https://www.walmart.com/search?q=clearance&sort=price_low";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (GitHub Actions) ClearanceRadar/1.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Walmart fetch failed: ${res.status}`);
  }

  const html = await res.text();

  const regex =
    /"name":"([^"]+)".*?"price":\{"price":([0-9.]+).*?"canonicalUrl":"([^"]+)"/g;

  const matches = [...html.matchAll(regex)];

  let message = "🟢 **Clearance Radar Ran Successfully**\n\n";

  if (matches.length === 0) {
    message += "No clearance items found this run.\n";
  } else {
    message += "🔥 **Walmart Clearance Deals** 🔥\n\n";
    matches.slice(0, 5).forEach(m => {
      const name = m[1];
      const price = m[2];
      const link = `https://www.walmart.com${m[3]}`;
      message += `• **${name}** — $${price}\n${link}\n\n`;
    });
  }

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message })
  });

  console.log("✅ Discord message sent");
}

run().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
