const webhook = process.env.DISCORD_WEBHOOK_URL;

async function run() {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  const url = "https://www.walmart.com/search?q=clearance";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (GitHub Actions) ClearanceRadar/1.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Walmart fetch failed: ${res.status}`);
  }

  const html = await res.text();

  // Find basic product data patterns
  const regex =
    /"name":"([^"]+)".*?"price":\{"price":([0-9.]+).*?"canonicalUrl":"([^"]+)"/g;

  const matches = [...html.matchAll(regex)];

  if (matches.length === 0) {
    console.log("No clearance products detected.");
    return;
  }

  let message = "🔥 **Walmart Clearance Detected** 🔥\n\n";

  matches.slice(0, 5).forEach((m) => {
    const name = m[1];
    const price = m[2];
    const link = `https://www.walmart.com${m[3]}`;

    message += `• **${name}** — $${price}\n${link}\n\n`;
  });

  const post = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message })
  });

  if (!post.ok) {
    const text = await post.text();
    throw new Error(`Discord error: ${post.status} ${text}`);
  }

  console.log("✅ Walmart clearance alert sent");
}

run().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
