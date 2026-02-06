const webhook = process.env.DISCORD_WEBHOOK_URL;

async function run() {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  const url = "https://www.walmart.com/browse/clearance/0";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Walmart fetch failed: ${res.status}`);
  }

  const html = await res.text();

  // Basic product extraction (Phase 1)
  const productMatches = [...html.matchAll(/"name":"(.*?)".*?"price":\{"price":(.*?)\}.*?"canonicalUrl":"(.*?)"/g)];

  if (productMatches.length === 0) {
    console.log("No clearance products detected");
    return;
  }

  let message = "🔥 **Walmart Clearance Detected** 🔥\n\n";

  productMatches.slice(0, 5).forEach(match => {
    const name = match[1];
    const price = match[2];
    const link = "https://www.walmart.com" + match[3];

    message += `• **${name}**\n💲 $${price}\n🔗 ${link}\n\n`;
  });

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message })
  });

  console.log("Walmart clearance alert sent");
}

run().catch(err => {
  console.error("❌", err.message);
  process.exit(1);
});
