const { safeRun, all } = require('./db');
const { sendTelegramMessage } = require('./telegram');
const STALE_THRESHOLD = 30; // saniye

async function insertOrUpdateProducts(products) {
    const existingRows = await all(`SELECT product_id, name, price, base_price, max_ratio FROM hb_iphone_axios`);
    const existingProducts = new Map(
        existingRows.map(r => [`${r.product_id}-${r.name}`, {
            price: r.price,
            base: r.base_price,
            max: r.max_ratio || 0
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
            const currentDate = new Date();
            const formattedTime = currentDate.toLocaleString("tr-TR", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
            // STOKTA
            if (p.name.toLowerCase().includes("iphone 17 pro") || p.name.toLowerCase().includes("iphone 17 pro max")) {
                await sendTelegramMessage(`💀 Stokta\n\n🛒 HEPSIBURADA\n\n🛍️ Ürün: [${p.name}](${p.url})\n\n💰 Güncel Fiyat: *${newPriceValue} TL*\n\n🕒 ${formattedTime} ⚠️ Axi`);
            }

            existingProducts.set(key, { price: newPriceValue, base: newPriceValue, max: 0 });
        } else {
            const oldPriceValue = oldEntry.price;
            const basePrice = oldEntry.base;
            // oldEntry.max: Son bildirimin tabanını tutar
            const maxRatio = oldEntry.max || 0;
            // Base price üzerinden indirim oranı
            const ratio = parseFloat(((1 - newPriceValue / basePrice) * 100).toFixed(2));

            // INDIRIM
            if (newPriceValue < oldPriceValue) {
                if (ratio >= 5 && ratio >= maxRatio + 2) {
                    const updateTime = now;
                    const isFirstNotification = (maxRatio === 0);
                    const messageHeader = isFirstNotification
                        ? `🔥 FİYAT DÜŞTÜ!`
                        : `⬇️ ÜRÜNÜN FİYATI TEKRAR DÜŞTÜ!`;
                    const dropAmountText = !isFirstNotification
                        ? ` (+${(ratio - maxRatio).toFixed(2)}% daha düştü!)`
                        : '';

                    await safeRun(
                        "UPDATE hb_iphone_axios SET price = ?, second_price = ?, ratio = ?, last_seen_at = ?, update_time = ?, max_ratio = ? WHERE product_id = ?",
                        [newPriceValue, oldPriceValue, ratio, now, updateTime, ratio, p.id]
                    );
                    const currentDate = new Date();
                    const formattedTime = currentDate.toLocaleString("tr-TR", {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                    });
                    await sendTelegramMessage(
                        `${messageHeader}\n\n🛒 HEPSIBURADA\n\n🛍️ Ürün: [${p.name}](${p.url})\n\n💰 Yeni Fiyat: *${newPriceValue} TL*\n💰 Önceki Fiyat: *${basePrice} TL*\n📉 İndirim Oranı: *%${ratio}* ${dropAmountText}\n\n🕒 ${formattedTime} ⚠️ Axi`
                    );
                    existingProducts.set(key, { price: newPriceValue, base: basePrice, max: ratio });
                } else {
                    // --- Normal Fiyat Düşüşü (Bildirim Yok) ---
                    await safeRun(
                        "UPDATE hb_iphone_axios SET price = ?, second_price = ?, ratio = ?, last_seen_at = ? WHERE product_id = ?",
                        [newPriceValue, oldPriceValue, ratio, now, p.id]
                    );
                    existingProducts.set(key, { price: newPriceValue, base: basePrice, max: maxRatio });
                }
            } else if (newPriceValue > oldPriceValue) {
                let updatedBasePrice = basePrice;
                let updatedMaxRatio = maxRatio;
                // Base Price'ın %1.5 altı = Toparlanma Eşiği (Örn: 60000 * 0.985 = 59100 TL)
                const resetThreshold = basePrice * 0.98;
                // Fiyat Base Price'tan yüksek mi? (Yeni tavan kırıldı mı?)
                const isNewPriceHigherThanBase = (newPriceValue > basePrice);
                // Fiyat, indirimden sonra toparlanma eşiğini geçti mi?
                const isSignificantRecovery = (newPriceValue >= resetThreshold);
                // 1. Durum: BASE PRICE KIRILMASI (En yüksek tavanı aştı)
                if (isNewPriceHigherThanBase) {
                    updatedBasePrice = newPriceValue;
                    // 🚨 Liste Fiyatı değiştiği için Max Ratio sıfırlanır.
                    updatedMaxRatio = 0;
                    // 2. Durum: BELİRGİN TOPARLANMA (Eski rekoru geçerli kılmayacak kadar yükseldi)
                } else if (isSignificantRecovery) {
                    // Fiyat, %1.5'luk geri çekilme eşiğini aştı, eski indirim rekorlarını unut.
                    // Base Price aynı kalır.
                    updatedMaxRatio = 0;
                }
                await safeRun(
                    // UPDATE sorgusu: price, base_price, max_ratio, last_seen_at, product_id
                    "UPDATE hb_iphone_axios SET price = ?, base_price = ?, max_ratio = ?, second_price = NULL, ratio = NULL, last_seen_at = ? WHERE product_id = ?",
                    [newPriceValue, updatedBasePrice, updatedMaxRatio, now, p.id]
                );
                existingProducts.set(key, { price: newPriceValue, base: updatedBasePrice, max: updatedMaxRatio });
            } else {
                await safeRun(
                    "UPDATE hb_iphone_axios SET last_seen_at = ? WHERE product_id = ?",
                    [now, p.id]
                );
            }
        }
    }

    // 30 saniyeden eski ürünleri sil
    await safeRun(
        `DELETE FROM hb_iphone_axios WHERE last_seen_at < ?`,
        [now - STALE_THRESHOLD]
    );

    console.log(`✅ ${products.length} ürün işlendi, stale ürünler temizlendi.`);
}

module.exports = { insertOrUpdateProducts };
