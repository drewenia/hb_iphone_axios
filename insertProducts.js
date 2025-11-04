const { safeRun, all } = require('./db');
const { sendTelegramMessage } = require('./telegram');
const STALE_THRESHOLD = 90;

async function insertOrUpdateProducts(products) {
    const TEN_MINUTES = 600;
    const existingRows = await all(`SELECT product_id, name, price, base_price, max_ratio FROM hb_iphone_axios`);
    const existingProducts = new Map(
        existingRows.map(r => [`${r.product_id}-${r.name}`, {
            price: r.price,
            base: r.base_price,
            max: r.max_ratio || 0,
            lastNotificationTime: r.last_notification_time || 0
        }])
    );
    const now = Math.floor(Date.now() / 1000); // epoch time

    for (const p of products) {
        const key = `${p.id}-${p.name}`;
        const newPriceValue = p.price;
        const oldEntry = existingProducts.get(key);

        if (!oldEntry) {
            await safeRun(
                "INSERT OR IGNORE INTO hb_iphone_axios (product_id, name, price, url, last_seen_at, base_price, max_ratio) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [p.id, p.name, newPriceValue, p.url, now, newPriceValue, 0]
            );
            existingProducts.set(key, { price: newPriceValue, base: newPriceValue, max: 0 });
        } else {
            const oldPriceValue = oldEntry.price;
            const basePrice = oldEntry.base;
            const maxRatio = oldEntry.max || 0;
            const ratio = parseFloat(((1 - newPriceValue / basePrice) * 100).toFixed(2));

            if (newPriceValue < oldPriceValue) {
                if (ratio >= 7 && ratio >= maxRatio + 2) {
                    const lastNotificationTime = oldEntry.lastNotificationTime || 0;
                    const timeSinceLastNotification = now - lastNotificationTime;

                    if (timeSinceLastNotification < TEN_MINUTES) {
                        console.log(`⏱️ ${p.name} için bildirim 10 dakika içinde tekrarlandı, atlanıyor.`);
                        continue;
                    }

                    const updateTime = now;
                    const isFirstNotification = (maxRatio === 0);
                    const messageHeader = isFirstNotification
                        ? `🚨 FİYAT DÜŞTÜ!`
                        : `⚠️ ÜRÜNÜN FİYATI TEKRAR DÜŞTÜ!`;

                    const dropAmountText = !isFirstNotification
                        ? ` (+${(ratio - maxRatio).toFixed(2)}% daha düştü!)`
                        : '';

                    await safeRun(
                        "UPDATE hb_iphone_axios SET price = ?, second_price = ?, ratio = ?, last_seen_at = ?, update_time = ?, max_ratio = ?, last_notification_time = ? WHERE product_id = ? AND name = ?",
                        [newPriceValue, oldPriceValue, ratio, now, updateTime, ratio, now, p.id, p.name]
                    );

                    const currentDate = new Date();
                    const formattedTime = currentDate.toLocaleString("tr-TR", {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                    });
                    const formattedNewPrice = newPriceValue.toLocaleString("tr-TR");
                    const formattedBasePrice = basePrice.toLocaleString("tr-TR");

                    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(p.name)}`;
                    await sendTelegramMessage(
                        `${messageHeader}\n\n🛒 HEPSİBURADA\n\n📱 TELEFON : [${p.name}](${p.url})\n\n💰 YENİ FİYAT : *${formattedNewPrice} TL*\n💰 ESKİ FİYAT : *${formattedBasePrice} TL*\n📉 İNDİRİM: *%${ratio}* ${dropAmountText}\n\n🕒 ${formattedTime} [Google'da Ara](${googleSearchUrl})`
                    );

                    existingProducts.set(key, { price: newPriceValue, base: basePrice, max: ratio, lastNotificationTime: now });
                } else {
                    await safeRun(
                        "UPDATE hb_iphone_axios SET price = ?, second_price = ?, ratio = ?, last_seen_at = ? WHERE product_id = ? AND name = ?",
                        [newPriceValue, oldPriceValue, ratio, now, p.id, p.name]
                    );
                    existingProducts.set(key, { price: newPriceValue, base: basePrice, max: maxRatio });
                }
            } else if (newPriceValue > oldPriceValue) {
                let updatedBasePrice = basePrice;
                let updatedMaxRatio = maxRatio;
                const resetThreshold = basePrice * 0.98;
                const isNewPriceHigherThanBase = (newPriceValue > basePrice);
                const isSignificantRecovery = (newPriceValue >= resetThreshold);

                if (isNewPriceHigherThanBase) {
                    updatedBasePrice = newPriceValue;
                    updatedMaxRatio = 0;
                } else if (isSignificantRecovery) {
                    updatedMaxRatio = 0;
                }
                await safeRun(
                    "UPDATE hb_iphone_axios SET price = ?, base_price = ?, max_ratio = ?, second_price = NULL, ratio = NULL, last_seen_at = ? WHERE product_id = ? AND name = ?",
                    [newPriceValue, updatedBasePrice, updatedMaxRatio, now, p.id, p.name]
                );
                existingProducts.set(key, { price: newPriceValue, base: updatedBasePrice, max: updatedMaxRatio });
            } else {
                await safeRun(
                    "UPDATE hb_iphone_axios SET last_seen_at = ? WHERE product_id = ? AND name = ?",
                    [now, p.id, p.name]
                );
            }
        }
    }

    await safeRun(
        `DELETE FROM hb_iphone_axios WHERE last_seen_at < ?`,
        [now - STALE_THRESHOLD]
    );

    console.log(`✅ ${products.length} ürün işlendi, stale ürünler temizlendi.`);
}

module.exports = { insertOrUpdateProducts };
