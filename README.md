# Google SEO Bot

<div align="center">

![Google SEO Bot](https://img.shields.io/badge/Google-SEO%20Bot-blue?style=for-the-badge)
![Electron](https://img.shields.io/badge/Electron-Latest-9FEAF9?style=for-the-badge&logo=electron)
![Node.js](https://img.shields.io/badge/Node.js-14.20+-green?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-ISC-yellow?style=for-the-badge)

**Organik trafik simülasyonu ile SEO sıralamanızı yükseltin**

[Özellikler](#-özellikler) • [Kurulum](#-kurulum) • [Kullanım](#-kullanım) • [Dokümantasyon](#-dokümantasyon)

</div>

---

Google SEO Bot, web sitenizin Google SEO sıralamasını iyileştirmek için organik trafik simülasyonu yapan gelişmiş bir **Electron tabanlı Windows masaüstü uygulamasıdır**. Modern ve kullanıcı dostu arayüzü ile bot, Google aramaları, sayfa gezintileri ve sitemap taraması dahil gerçekçi tarama davranışları gerçekleştirir ve Google'a olumlu SEO sinyalleri gönderir.

> ⚠️ **Önemli**: Bu bot eğitim ve test amaçlıdır. Google'ın hizmet şartlarına uygun kullanın.

## 🆕 Son Güncellemeler (v1.1.0)

- ✅ **Rotating Proxy Düzeltmesi**: Proxy format normalizasyonu ve SOCKS4 filtrelenmesi
- ✅ **Proxy Test Özelliği**: Proxy'lerin çalışıp çalışmadığını test edin
- ✅ **Google Sıralama Takibi**: Otomatik sıralama kaydı ve manuel kontrol
- ✅ **SEO Analiz Sayfası**: Detaylı SEO analizi ve 0-100 skor sistemi
- ✅ **Arama Motoru Botlarını Tetikleme**: Google ve Bing sitemap ping

## 🚀 Özellikler

### 🎨 Arayüz ve Kullanıcı Deneyimi
- **Modern GUI Arayüzü**: Kullanıcı dostu Windows masaüstü uygulaması
- **Gerçek Zamanlı Loglar**: Tüm işlemleri canlı olarak takip edin
- **📈 İnteraktif Grafikler**: Ziyaret istatistiklerini görselleştirin (çizgi/çubuk grafik)
- **İstatistikler**: Toplam ziyaret sayısı ve son ziyaret bilgileri
- **🌍 Çoklu Dil Desteği**: 7 dilde tam destek (TR, EN, DE, FR, RU, JA, KO)
- **🌐 Çevrilebilir Log Mesajları**: 114+ log mesajı her dilde çevrilmiştir

### 🔍 Arama Motorları ve SEO
- **Çoklu Arama Motoru Desteği**: Google, Bing, Yahoo, DuckDuckGo, Yandex
- **Google Arama Simülasyonu**: Gerçekçi Google aramaları yaparak sitenize organik trafik gönderir
- **Otomatik Sayfa Gezintisi**: Sitenizdeki sayfalar arasında gerçekçi gezinti yapar
- **Sitemap Desteği**: Sitemap.xml dosyalarını otomatik olarak bulur ve tüm sayfaları ziyaret eder
- **🔍 SEO Analiz Sayfası**: Detaylı SEO analizi yapar (Meta tags, Headings, Images, Links, Technical SEO)
- **📊 Google Sıralama Takibi**: Google'da sıralama pozisyonunuzu otomatik kaydeder ve takip eder
- **🤖 Arama Motoru Botlarını Tetikleme**: Google ve Bing'e sitemap ping yaparak botları bilgilendirir

### ⚙️ Gelişmiş Özellikler
- **🔄 Rotating Proxy Desteği**: Otomatik proxy rotasyonu ile farklı IP adreslerinden trafik gönderir
- **🧪 Proxy Test Özelliği**: Proxy'lerin çalışıp çalışmadığını test eder
- **📈 Zamanlanmış Ziyaretler**: Ziyaretleri belirli zaman aralıklarında planlayabilirsiniz
- **🕵️ Stealth Modu**: Bot tespitini önlemek için gelişmiş spoofing teknikleri
- **🎭 Gerçekçi Davranışlar**: Rastgele scroll, bekleme süreleri ve sayfa gezintileri
- **🔗 URL Otomatik Düzeltme**: http/https protokolü otomatik eklenir
- **✅ Proxy Format Desteği**: HTTP, HTTPS, SOCKS5 proxy formatlarını destekler (SOCKS4 otomatik filtrelenir)

## 📋 Gereksinimler

| Gereksinim | Minimum Versiyon | Notlar |
|------------|------------------|--------|
| **Node.js** | 14.20.0+ | [Node.js İndir](https://nodejs.org/) |
| **Google Chrome** | Son sürüm | ChromeDriver otomatik yüklenir |
| **İşletim Sistemi** | Windows 10+ | Electron Windows uygulaması |

> 💡 **Not**: ChromeDriver, npm install sırasında otomatik olarak yüklenir.

## 📦 Kurulum

### Hızlı Başlangıç

```bash
# 1. Projeyi klonlayın
git clone https://github.com/emrahkartals/google-seo-bot
cd google-seo-bot

# 2. Bağımlılıkları yükleyin
npm install

# 3. Uygulamayı başlatın
npm start
```

### Windows Installer Oluşturma

Uygulamayı Windows installer (.exe) olarak derlemek için:

```bash
npm run build
```

Bu komut `dist/` klasöründe yüklenebilir bir Windows installer oluşturur.

### Proxy Dosyaları (Opsiyonel)

Proxy kullanmak istiyorsanız, proxy dosyalarını `proxy/` klasörüne ekleyin:

**Desteklenen Formatlar:**
```
http://123.45.67.89:8080
https://98.76.54.32:3128
socks5://111.222.333.444:1080
123.45.67.89:8080  (otomatik http:// eklenir)
```

- Her satırda bir proxy adresi
- Desteklenen: `http://`, `https://`, `socks5://` (SOCKS4 otomatik filtrelenir)
- Format: `protocol://ip:port` veya `ip:port` (otomatik http:// eklenir)
- Proxy test butonu ile çalışan proxy'leri kontrol edebilirsiniz

## 🎯 Kullanım

### GUI Arayüzü ile Kullanım (Önerilen)

#### Adım 1: Uygulamayı Başlatın
```bash
npm start
```

#### Adım 2: Ayarları Yapılandırın

1. **Dil Seçimi** 🌍
   - Sağ üstteki dil seçiciden istediğiniz dili seçin
   - Desteklenen diller: Türkçe, İngilizce, Almanca, Fransızca, Rusça, Japonca, Korece

2. **Temel Ayarlar**
   - **Site URL**: Hedef sitenizin URL'ini girin (http/https otomatik eklenir)
   - **Ziyaretçi Sayısı**: Toplam ziyaret sayısını belirleyin
   - **Başlangıç/Bitiş Zamanı**: Ziyaretlerin zaman aralığını seçin

3. **Arama Ayarları**
   - **Arama Terimleri**: Virgülle ayrılmış arama terimleri (örn: `keyword1, keyword2`)
   - **Arama Motoru**: Google, Bing, Yahoo, DuckDuckGo, Yandex veya Direct seçin

4. **Gelişmiş Ayarlar**
   - **Sayfa Min/Max Süre**: Sayfada kalma süreleri (saniye)
   - **Toplam Min/Max Süre**: Toplam ziyaret süreleri (dakika)
   - **Gezilecek Sayfa Sayısı**: Sitemap'ten kaç sayfa ziyaret edilecek

#### Adım 3: Ek Özellikler (Opsiyonel)

**SEO Analizi:**
- "SEO Analizi" butonuna tıklayın
- Detaylı SEO raporu modal'da görüntülenir
- SEO skoru (0-100) ve tüm kriterler kontrol edilir

**Proxy Test:**
- "Proxy Test Et" butonuna tıklayın
- İlk 20 proxy test edilir
- Çalışan/çalışmayan proxy'ler loglarda gösterilir

**Sıralama Kontrol:**
- URL ve keyword girin
- "Sıralama Kontrol Et" butonuna tıklayın
- Google'da pozisyon kontrol edilir

**Botları Tetikle:**
- "Botları Tetikle" butonuna tıklayın
- Google ve Bing'e sitemap ping yapılır
- Arama motoru botları bilgilendirilir

#### Adım 4: Bot'u Başlatın
- "Başlat" butonuna tıklayın
- Loglar panelinde işlemleri takip edin (tüm mesajlar seçilen dilde görüntülenir)
- Grafik panelinde ziyaret istatistiklerini görüntüleyin
- Google araması yapıldığında sıralama otomatik kaydedilir
- İstediğiniz zaman "Durdur" butonuna tıklayarak durdurabilirsiniz

### Programatik Kullanım (Gelişmiş)

```javascript
const bot = require('./libs/index');

// Log callback'i ayarla
bot.setLogCallback((message) => {
    console.log(message);
});

// Basit kullanım - Direkt ziyaret
bot.main(
    'https://example.com',  // URL
    'example search',        // Arama terimi (Google modu için)
    5,                      // Ziyaret sayısı
    'Direct',               // Mod: 'Direct', 'Google', 'Proxy'
    10,                     // Min süre (saniye)
    30,                     // Max süre (saniye)
    true                    // Sitemap kullan
);
```

### Gelişmiş Kullanım - Zamanlanmış Ziyaretler

```javascript
const bot = require('./libs/index');

// Log callback'i ayarla
bot.setLogCallback((message) => {
    console.log(message);
});

// Ziyaret callback'i ayarla
bot.setVisitCallback((visit) => {
    console.log('Ziyaret kaydedildi:', visit.timestamp);
});

// Zamanlanmış ziyaretler başlat
const config = {
    url: 'https://example.com',
    visitorCount: 100,
    startTime: new Date('2024-01-01T09:00:00'),
    endTime: new Date('2024-01-01T18:00:00'),
    distributionType: 'hourly', // 'hourly' veya 'daily'
    newVisitorRate: 70, // %70 yeni ziyaretçi
    searchKeywords: ['example keyword', 'another keyword'],
    searchEngine: 'google', // 'google' veya 'direct'
    alwaysDirect: false,
    totalMinTime: 2, // Dakika
    totalMaxTime: 5, // Dakika
    pageMinTime: 10, // Saniye
    pageMaxTime: 30, // Saniye
    pageCount: 10
};

bot.start(config);

// İşlemi durdurmak için
// bot.stop();
```

### Modlar

1. **Direct**: Sitenize direkt ziyaret yapar
2. **Google**: Google'da arama yaparak sitenize ulaşır (SEO için önerilir)
3. **Proxy**: Proxy sunucu üzerinden Google araması yapar

### Sitemap Kontrolü

GUI arayüzünde "Sitemap Kontrol Et" butonunu kullanarak veya programatik olarak:

```javascript
const bot = require('./libs/index');

bot.checkSitemap('https://example.com').then((count) => {
    console.log(`Sitemap'te ${count} sayfa bulundu`);
});
```

### Dil Değiştirme

Uygulama arayüzünde sağ üstteki dil seçiciden istediğiniz dili seçebilirsiniz. Seçilen dil:
- Tüm arayüz metinlerini değiştirir
- Log mesajlarını çevirir
- Zaman damgalarını formatlar
- Grafik ve istatistik metinlerini günceller

**Desteklenen Diller:**
- 🇹🇷 Türkçe (tr)
- 🇬🇧 İngilizce (en)
- 🇩🇪 Almanca (de)
- 🇫🇷 Fransızca (fr)
- 🇷🇺 Rusça (ru)
- 🇯🇵 Japonca (ja)
- 🇰🇷 Korece (ko)

## ⚙️ Yapılandırma

### Proxy Kullanımı

Proxy dosyalarını `proxy/` klasörüne ekleyin. Her satırda bir proxy adresi olmalı:
```
123.45.67.89:8080
98.76.54.32:3128:username:password
```

### Chrome Ayarları

Bot, Chrome'u headless olmayan modda çalıştırır (pencereler görünür). Bu, bot tespitini azaltmak için önemlidir.

## 📚 Dokümantasyon

### Modlar

| Mod | Açıklama | SEO Etkisi |
|-----|----------|------------|
| **Direct** | Sitenize direkt ziyaret yapar | ⭐ Düşük |
| **Google** | Google'da arama yaparak sitenize ulaşır | ⭐⭐⭐ Yüksek |
| **Proxy** | Proxy sunucu üzerinden Google araması yapar | ⭐⭐⭐ Yüksek |

> 💡 **Öneri**: SEO için en iyi sonuçlar için "Google" modunu kullanın.

## 📝 API Referansı

### `main(url, keyboard, count, option, minTime, maxTime, useSitemap)`

Ana bot fonksiyonu.

**Parametreler:**
- `url` (string): Ziyaret edilecek site URL'i
- `keyboard` (string): Google araması için arama terimi
- `count` (number): Ziyaret sayısı
- `option` (string): Mod ('Direct', 'Google', 'Proxy')
- `minTime` (number): Minimum bekleme süresi (saniye)
- `maxTime` (number): Maksimum bekleme süresi (saniye)
- `useSitemap` (boolean): Sitemap kullanılsın mı?

### `start(config)`

Zamanlanmış ziyaretler başlatır.

**Config Parametreleri:**
- `url` (string): Site URL'i
- `visitorCount` (number): Toplam ziyaretçi sayısı
- `startTime` (Date): Başlangıç zamanı
- `endTime` (Date): Bitiş zamanı
- `distributionType` (string): 'hourly' veya 'daily'
- `newVisitorRate` (number): Yeni ziyaretçi yüzdesi (0-100)
- `searchKeywords` (array): Arama terimleri dizisi
- `searchEngine` (string): 'google' veya 'direct'
- `alwaysDirect` (boolean): Her zaman direkt git
- `totalMinTime` (number): Minimum toplam süre (dakika)
- `totalMaxTime` (number): Maksimum toplam süre (dakika)
- `pageMinTime` (number): Sayfa başına minimum süre (saniye)
- `pageMaxTime` (number): Sayfa başına maksimum süre (saniye)
- `pageCount` (number): Gezilecek sayfa sayısı

### `stop()`

Çalışan tüm işlemleri durdurur ve Chrome pencerelerini kapatır.

### `setLogCallback(callback)`

Log mesajları için callback ayarlar.

### `setVisitCallback(callback)`

Ziyaret kayıtları için callback ayarlar.

### `checkSitemap(url)`

Sitemap'teki sayfa sayısını kontrol eder.

### `testProxies()`

Proxy'leri test eder ve çalışan/çalışmayan proxy'leri gösterir.

### `checkRanking(url, keyword)`

Google'da belirtilen keyword için sıralama pozisyonunu kontrol eder.

### `analyzeSEO(url)`

Sitenin detaylı SEO analizini yapar ve rapor döndürür.

### `pingSearchEngines(url)`

Arama motoru botlarını (Google, Bing) tetiklemek için sitemap ping yapar.

## 🌍 Çoklu Dil Desteği

Uygulama **7 farklı dilde** tam destek sunar:

| Dil | Kod | Durum |
|-----|-----|-------|
| 🇹🇷 Türkçe | `tr` | ✅ Tam Destek |
| 🇬🇧 İngilizce | `en` | ✅ Tam Destek |
| 🇩🇪 Almanca | `de` | ✅ Tam Destek |
| 🇫🇷 Fransızca | `fr` | ✅ Tam Destek |
| 🇷🇺 Rusça | `ru` | ✅ Tam Destek |
| 🇯🇵 Japonca | `ja` | ✅ Tam Destek |
| 🇰🇷 Korece | `ko` | ✅ Tam Destek |

### Çeviri Kapsamı

- ✅ **Arayüz Çevirileri**: Tüm butonlar, etiketler ve mesajlar
- ✅ **Log Mesajları**: 114+ log mesajı her dilde çevrilmiştir
- ✅ **Zaman Formatları**: Tarih ve saat formatları dile göre ayarlanır
- ✅ **Dinamik Çeviri**: Dil değişikliği anında uygulanır

### Log Mesajları Kategorileri

Backend'de gönderilen tüm log mesajları otomatik olarak seçilen dile çevrilir:
- 🔍 Arama motoru mesajları (Google, Bing, Yahoo, DuckDuckGo, Yandex)
- 🗺️ Sitemap işlem mesajları
- 📊 Ziyaret kayıt mesajları
- ❌ Hata mesajları
- 📈 İstatistik mesajları

## ⚠️ Önemli Notlar ve Uyarılar

> ⚠️ **Yasal Uyarı**: Bu bot eğitim ve test amaçlıdır. Kullanımınızdan siz sorumlusunuz.

### Kullanım Kuralları

- ✅ Google'ın hizmet şartlarına uygun kullanın
- ✅ Sitenizin kendi trafiğinizi simüle etmek yasal olabilir
- ❌ Google'ı manipüle etmeye çalışmak yasak olabilir
- ❌ Aşırı kullanım Google tarafından tespit edilebilir
- ⚠️ Proxy kullanırken güvenilir proxy sağlayıcıları tercih edin

### Öneriler

- 🎯 Makul ziyaret sayıları kullanın
- 🕐 Ziyaretleri gerçekçi zaman aralıklarında planlayın
- 🔄 Farklı arama terimleri kullanın
- 📊 Sonuçları düzenli olarak izleyin

## 🐛 Sorun Giderme

### Yaygın Sorunlar ve Çözümleri

#### ChromeDriver Hatası
```bash
# ChromeDriver'ı manuel olarak yükleyin
npm install chromedriver --save
```

#### Proxy Bağlantı Hatası
- ✅ Proxy dosyalarını kontrol edin (`proxy/` klasörü)
- ✅ Proxy formatının doğru olduğundan emin olun (`http://ip:port`, `socks5://ip:port` vb.)
- ✅ "Proxy Test Et" butonunu kullanarak proxy'lerin çalışıp çalışmadığını kontrol edin
- ✅ SOCKS4 proxy'ler otomatik filtrelenir (Chrome desteklemiyor)
- ✅ Firewall ayarlarınızı kontrol edin
- ✅ Rotating proxy sorunu düzeltildi - artık proxy'ler doğru formatta kullanılıyor

#### Sitemap Bulunamıyor
- ✅ Sitenizin `sitemap.xml` dosyasının erişilebilir olduğundan emin olun
- ✅ `robots.txt` dosyasında sitemap URL'ini kontrol edin
- ✅ Sitemap URL'ini manuel olarak test edin (tarayıcıda açın)

#### Log Mesajları Çevrilmiyor
- ✅ Dil seçiciden doğru dili seçtiğinizden emin olun
- ✅ Tarayıcı konsolunda hata olup olmadığını kontrol edin (F12)
- ✅ Uygulamayı yeniden başlatmayı deneyin
- ✅ `locales/` klasöründeki dil dosyalarının mevcut olduğunu kontrol edin

#### Bot Çalışmıyor
- ✅ Chrome tarayıcısının yüklü olduğundan emin olun
- ✅ Node.js versiyonunuzun 14.20.0+ olduğunu kontrol edin
- ✅ Tüm bağımlılıkların yüklü olduğundan emin olun (`npm install`)

## 🤝 Katkıda Bulunabilirsiniz

Katkılarınızı bekliyoruz! Bu projeyi geliştirmek için:

1. ⭐ Bir yıldızınızı alırım
2. 🍴 Fork edinin
3. 🌿 Yeni bir branch oluşturun (`git checkout -b feature/amazing-feature`)
4. 💾 Değişikliklerinizi commit edin (`git commit -m 'Add some amazing feature'`)
5. 📤 Branch'inizi push edin (`git push origin feature/amazing-feature`)
6. 🔄 Pull Request oluşturun

### Katkı Kuralları

- ✅ Kod standartlarına uyun
- ✅ Yeni özellikler için test ekleyin
- ✅ README'yi güncelleyin
- ✅ Açıklayıcı commit mesajları yazın

## 📄 Lisans

Bu proje [ISC](https://opensource.org/licenses/ISC) lisansı altında lisanslanmıştır.

## 📞 İletişim ve Destek

- 🐛 **Hata Bildirimi**: [Issues](https://github.com/emrahkartals/google-seo-bot/issues) sayfasından hata bildirebilirsiniz
- 💡 **Özellik İsteği**: Yeni özellik önerileri için issue açabilirsiniz
- ❓ **Sorular**: Sorularınız için issue açabilirsiniz

## 🙏 Teşekkürler

- [Electron](https://www.electronjs.org/) - Masaüstü uygulama framework'ü
- [Selenium WebDriver](https://www.selenium.dev/) - Web otomasyonu
- [Chart.js](https://www.chartjs.org/) - Grafik kütüphanesi

---

<div align="center">

**⭐ Bu projeyi beğendiyseniz yıldız vermeyi unutmayın! ⭐**

Made with ❤️ by emrahkartals

</div>

