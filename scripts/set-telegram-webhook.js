require("dotenv").config();

async function setTelegramWebhook() {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SITE_URL } = process.env;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !SITE_URL) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET va SITE_URL sozlamalarini kiriting."
    );
  }

  if (!/^[A-Za-z0-9_-]{1,256}$/.test(TELEGRAM_WEBHOOK_SECRET)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET faqat harf, raqam, _ va - belgilaridan iborat bo‘lsin.");
  }

  let siteUrl;
  try {
    siteUrl = new URL(SITE_URL);
  } catch {
    throw new Error("SITE_URL to‘g‘ri URL bo‘lishi kerak.");
  }
  if (siteUrl.protocol !== "https:") {
    throw new Error("Telegram webhook uchun SITE_URL HTTPS bo‘lishi kerak.");
  }

  const webhookUrl = new URL("/api/telegram/webhook", siteUrl);
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl.toString(),
        secret_token: TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message"]
      })
    }
  );
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(`Telegram webhook sozlanmadi: ${result.description || response.status}`);
  }

  console.log(`Telegram webhook sozlandi: ${webhookUrl}`);
}

setTelegramWebhook().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
