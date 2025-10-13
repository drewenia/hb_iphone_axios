const TelegramBot = require('node-telegram-bot-api');

// Bot token'ını buraya ekle
const TELEGRAM_TOKEN = '8356577387:AAGahFMIrLyBwiBHp17wBm_3mj5AkBf0fYM';
const TELEGRAM_CHAT_ID = "-1003026592216"; // <-- buraya chat ID'yi yaz
//const TELEGRAM_CHAT_ID = "-4980847367"; // TEST
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

async function sendTelegramMessage(message) {
    try {
        if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
            await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
                parse_mode: "Markdown",
                disable_web_page_preview: true
            });
            console.log("Telegram mesajı başarıyla gönderildi.");
        } else {
            console.error("Telegram TOKEN veya CHAT_ID eksik. Mesaj gönderilemedi.");
        }
    } catch (error) {
        console.error("Telegram mesajı gönderilirken hata oluştu:", error.message);
    }
}

module.exports = { sendTelegramMessage };