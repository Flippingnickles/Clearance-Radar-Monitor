const webhook = process.env.DISCORD_WEBHOOK_URL;

async function run() {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  // Walmart clearance search (simple test)
  const url = "https://www.walmart.com/search?q=clearance";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Walmart fetch failed: ${res.status}`);
  }

  const html = await res.text();

  // VERY basic signal check (Phase 1)
  const found = html.toLowerCase().includes("clearance");

  if (!found) {
    console.log("No clearance signal found");
    return;
  }

  const payload = {
    content: `🔥 **Walmart Clearance Scan**
Clearance keyword detected on Walmart search page.
🔗 ${url}
⏰ ${new Date().toLocaleString()}`
  };

  const discordRes = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!discordRes.ok) {
    throw new Error("Discord webhook failed");
  }

  console.log("✅ Walmart clearance alert sent");
}

run().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
