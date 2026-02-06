const webhook = process.env.DISCORD_WEBHOOK_URL;

async function run() {
  if (!webhook) throw new Error("DISCORD_WEBHOOK_URL not found");

  const payload = {
    content: `🔥 Clearance Radar is LIVE\nTest alert sent at ${new Date().toLocaleString()}`
  };

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord error: ${res.status} ${text}`);
  }

  console.log("✅ Discord alert sent");
}

run().catch(err => {
  console.error("❌", err.message);
  process.exit(1);
});
