const bot = require('./libs/index');

// Log callback'i ayarla
bot.setLogCallback((message) => {
    console.log(message);
});

// Ziyaret callback'i ayarla
bot.setVisitCallback((visit) => {
    console.log('✅ Ziyaret kaydedildi:', visit.timestamp);
});

// Örnek kullanım - Basit direkt ziyaret
console.log('🚀 Google SEO Bot başlatılıyor...\n');

// Örnek 1: Basit direkt ziyaret (5 ziyaret) - AKTİF
// URL'yi değiştirmeyi unutmayın!
bot.main(
    'https://example.com',  // ⚠️ Buraya kendi sitenizin URL'ini yazın
    'example search',        // Arama terimi (Google modu için)
    1,                      // Ziyaret sayısı (test için 1)
    'Direct',               // Mod: 'Direct', 'Google', 'Proxy'
    10,                     // Min süre (saniye)
    30,                     // Max süre (saniye)
    true                    // Sitemap kullan
);

// Örnek 2: Google araması ile ziyaret
// bot.main(
//     'https://example.com',
//     'example keyword',
//     3,
//     'Google',
//     15,
//     45,
//     false
// );

// Örnek 3: Zamanlanmış ziyaretler (Gelişmiş) - PASİF
// Aktif etmek için yukarıdaki bot.main() çağrısını yorum satırı yapın ve bu kısmı aktif edin
/*
const config = {
    url: 'https://example.com', // Buraya kendi sitenizin URL'ini yazın
    visitorCount: 10, // Toplam ziyaretçi sayısı
    startTime: new Date(), // Şimdi başla
    endTime: new Date(Date.now() + 60 * 60 * 1000), // 1 saat sonra bitir
    distributionType: 'hourly', // 'hourly' veya 'daily'
    newVisitorRate: 70, // %70 yeni ziyaretçi (Google'dan gelecek)
    searchKeywords: ['example keyword', 'test keyword'], // Arama terimleri
    searchEngine: 'google', // 'google' veya 'direct'
    alwaysDirect: false,
    totalMinTime: 2, // Minimum toplam süre (dakika)
    totalMaxTime: 5, // Maksimum toplam süre (dakika)
    pageMinTime: 10, // Sayfa başına minimum süre (saniye)
    pageMaxTime: 30, // Sayfa başına maksimum süre (saniye)
    pageCount: 10 // Gezilecek sayfa sayısı
};

// Zamanlanmış ziyaretleri başlat
bot.start(config);
*/

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n⏹️  İşlem durduruluyor...');
    bot.stop();
    setTimeout(() => {
        process.exit(0);
    }, 2000);
});

process.on('SIGTERM', () => {
    console.log('\n\n⏹️  İşlem durduruluyor...');
    bot.stop();
    setTimeout(() => {
        process.exit(0);
    }, 2000);
});

