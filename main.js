const axios = require('axios');
const baseHeaders = require('./headers');
const { getRandomBrowserConfig, getRandomAcceptLanguage } = require('./uaManager.js');
const cheerio = require('cheerio');
const { insertOrUpdateProducts } = require('./insertProducts');

const max_pages = 2; // ← burayı değiştirebilirsin
const baseUrl = "https://www.hepsiburada.com/apple/iphone-ios-telefonlar-c-60005202?filtreler=satici:Hepsiburada";

// İstek fonksiyonu
async function sendGetRequest() {
    // 1. Rastgele Tarayıcı Konfigürasyonunu Çekme
    const config = getRandomBrowserConfig();
    const randomLanguage = getRandomAcceptLanguage();

    // 2. Dinamik Headers Objesini Oluşturma
    const headers = {
        ...baseHeaders,
        'User-Agent': config.userAgent,
        'Accept-Language': randomLanguage,
    };

    let axiosConfig = {
        headers: headers,
    };

    function getRandomDelay(min = 2000, max = 5000) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    const allProducts = [];
    const seenIds = new Set();

    for (let page = 1; page <= max_pages; page++) {
        const pageUrl = page === 1 ? baseUrl : `${baseUrl}&sayfa=${page}`;
        console.log(`\n==============================`);
        console.log(`🔍 Sayfa ${page}: ${pageUrl}`);
        console.log("==============================");
        try {
            // Axios, dataPayload'u otomatik olarak JSON formatına çevirip gönderir
            const response = await axios.get(pageUrl, axiosConfig);
            if (!response.data) {
                console.error("❌ Boş response geldi, cheerio yüklenemedi.");
                return;
            }
            const $ = cheerio.load(response.data);
            const products = [];
            const $ul = $(`ul.productListContent-frGrtf5XrVXRwJ05HUfU.productListContent-rEYj2_8SETJUeqNhyzSm[id="${page}"]`);
            $ul.find('li:not(.productListContent-DZbeDrMzX6R9iSLP7Mxt)').each((_, li) => {
                const titleElement = $(li).find("h2.title-module_titleRoot__dNDiZ > span.title-module_titleText__8FlNQ");
                let title = titleElement.text().trim();
                const priceElement = $(li).find("div.price-module_finalPrice__LtjvY");
                const linkElement = $(li).find("article.productCard-module_article__HJ97o > a");
                // Fiyat parse
                let numericPrice = null;
                if (priceElement.length) {
                    let priceText = priceElement.text().trim().replace(/[^0-9,.]/g, "");
                    if (priceText.includes(",")) {
                        priceText = priceText.replace(/\./g, "").replace(",", ".");
                    } else if (priceText.includes(".")) {
                        const lastDotIndex = priceText.lastIndexOf(".");
                        if (priceText.length - 1 - lastDotIndex <= 2) {
                            priceText = priceText.replace(/\./g, "");
                        } else {
                            priceText = priceText.replace(/\./g, "");
                        }
                    }
                    const parsedPrice = parseInt(priceText);
                    if (!isNaN(parsedPrice)) numericPrice = parsedPrice;
                }

                const productUrl = linkElement.attr("href")
                    ? new URL(linkElement.attr("href"), "https://www.hepsiburada.com").href
                    : null;

                const match = productUrl.match(/(?:-p-|pm-)([A-Z0-9]+)(?:\?|$)/);
                const productId = match ? match[1] : null;

                if (productId && title && productUrl) {
                    const uniqueKey = `${productId}_${title.trim().toLowerCase()}`;

                    if (!seenIds.has(uniqueKey)) {
                        seenIds.add(uniqueKey);
                        products.push({
                            id: productId,
                            name: title,
                            price: numericPrice,
                            url: productUrl
                        });
                    }
                }
            });

            console.log(`✅ ${products.length} ürün bulundu.`);
            allProducts.push(...products);

            if (page < max_pages) {
                const delay = getRandomDelay();
                console.log(`⏳ ${delay / 1000} saniye rastgele bekleniyor...`);
                await new Promise((r) => setTimeout(r, delay));
            }

        } catch (error) {
            console.error('--- İSTEK BAŞARISIZ ---');
            if (error.response) {
                console.error(`Hata Kodu: ${error.response.status}`);
                console.error('Hata Yanıtı:', error.response.data);
            } else if (error.request) {
                console.error('Ağ Hatası: Sunucuya Ulaşılamadı.');
            } else {
                console.error('İstek Kurulum Hatası:', error.message);
            }
        }
        if (allProducts.length > 0) {
            await insertOrUpdateProducts(allProducts);
        } else {
            console.log('⚠️ Sayfada ürün bulunamadı.');
        }
    }
    console.clear();
}

sendGetRequest();
