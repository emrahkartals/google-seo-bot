const webDriver = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const chromedriver = new chrome.ServiceBuilder(require('chromedriver').path)
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const auto = require('./autobot')
const loadproxy = require('./proxy')
const spoofing = require('./spoofing')

var logCallback = null
var visitCallback = null
var rankingCallback = null
var isRunning = false
var scheduledVisits = []
var visitInterval = null
var globalHeadlessMode = true // Varsayılan olarak gizli mod aktif

function log(message) {
    if (logCallback) {
        logCallback(message)
    }
    console.log(message)
}

// i18n log helper - sends log in i18n format
function logI18n(key, params) {
    var message = 'I18N:' + key
    if (params) {
        for (var paramKey in params) {
            if (params.hasOwnProperty(paramKey)) {
                message += '|' + paramKey + ':' + params[paramKey]
            }
        }
    }
    log(message)
}

function recordVisit() {
    if (visitCallback) {
        try {
            visitCallback({
                timestamp: new Date().toISOString()
            })
            log(`[VISIT] Ziyaret kaydedildi`)
        } catch (e) {
            log(`[VISIT] Ziyaret kaydı hatası: ${e.message}`)
        }
    } else {
        log(`[VISIT] Visit callback ayarlanmamış`)
    }
}

function recordRanking(url, keyword, position, page, engine) {
    if (rankingCallback) {
        try {
            rankingCallback({
                url: url,
                keyword: keyword,
                position: position,
                page: page || 1,
                engine: engine || 'google',
                timestamp: new Date().toISOString()
            })
            log(`[RANKING] Sıralama kaydedildi: ${keyword} - Pozisyon ${position} (Sayfa ${page || 1})`)
        } catch (e) {
            log(`[RANKING] Sıralama kaydı hatası: ${e.message}`)
        }
    }
}

const PERMISSIONS = [
    // "--headless", // Kaldırıldı - pencereler görünür olacak (artık addHeadlessIfEnabled ile kontrol ediliyor)
    "--mute-audio",
    "--disable-logging",
    "--disable-infobars",
    "--disable-dev-shm-usage",
]

// Headless mode'u koşullu olarak ekle
function addHeadlessIfEnabled(options) {
    if (globalHeadlessMode) {
        options.addArguments('--headless')
    }
}

function delay(time){
    return new Promise(resolve => setTimeout(resolve, time));
}

function random(min, max){
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function getRandomTime(minSeconds, maxSeconds) {
    return random(minSeconds * 1000, maxSeconds * 1000);
}

// Proxy normalizasyon fonksiyonu - proxy formatını düzeltir
function normalizeProxy(proxyString) {
    if (!proxyString) return null;
    
    // Boşlukları temizle
    var proxy = proxyString.trim();
    if (!proxy || proxy.length === 0) return null;
    
    // Protocol kontrolü
    var protocol = null;
    var address = proxy;
    
    // Protocol varsa ayır
    if (proxy.startsWith('http://')) {
        protocol = 'http';
        address = proxy.substring(7); // 'http://' kısmını çıkar
    } else if (proxy.startsWith('https://')) {
        protocol = 'https';
        address = proxy.substring(8); // 'https://' kısmını çıkar
    } else if (proxy.startsWith('socks5://')) {
        protocol = 'socks5';
        address = proxy.substring(9); // 'socks5://' kısmını çıkar
    } else if (proxy.startsWith('socks4://')) {
        // Chrome SOCKS4'ü desteklemiyor, null döndür
        return null;
    } else {
        // Protocol yoksa HTTP varsay
        protocol = 'http';
        address = proxy;
    }
    
    // Address boşsa null döndür
    if (!address || address.length === 0) return null;
    
    // Chrome için proxy formatı: protocol://address
    // Chrome sadece http, https ve socks5 destekler
    if (protocol === 'http' || protocol === 'https') {
        return `${protocol}://${address}`;
    } else if (protocol === 'socks5') {
        return `socks5://${address}`;
    }
    
    return null;
}

async function fetchSitemap(sitemapUrl) {
    return new Promise((resolve, reject) => {
        try {
            var urlObj = new URL(sitemapUrl)
            var client = urlObj.protocol === 'https:' ? https : http
            
            client.get(sitemapUrl, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`))
                    return
                }
                var data = ''
                res.on('data', (chunk) => {
                    data += chunk
                })
                res.on('end', () => {
                    resolve(data)
                })
            }).on('error', (err) => {
                reject(err)
            })
        } catch (e) {
            reject(e)
        }
    })
}

async function parseSitemap(sitemapUrl) {
    try {
        log(`[SITEMAP] Sitemap yükleniyor: ${sitemapUrl}`)
        var xmlContent = await fetchSitemap(sitemapUrl)
        
        // XML'den URL'leri çıkar (basit regex ile)
        var urls = []
        var urlRegex = /<loc>(.*?)<\/loc>/g
        var match
        
        while ((match = urlRegex.exec(xmlContent)) !== null) {
            var url = match[1].trim()
            if (url && url.startsWith('http')) {
                urls.push(url)
            }
        }
        
        // Eğer sitemap index ise (sitemap içinde sitemap), onları da çek
        var sitemapIndexRegex = /<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/g
        var sitemapMatch
        while ((sitemapMatch = sitemapIndexRegex.exec(xmlContent)) !== null) {
            var subSitemapUrl = sitemapMatch[1].trim()
            if (subSitemapUrl && subSitemapUrl.includes('sitemap')) {
                log(`[SITEMAP] Alt sitemap bulundu: ${subSitemapUrl}`)
                try {
                    var subUrls = await parseSitemap(subSitemapUrl)
                    urls = urls.concat(subUrls)
                } catch (e) {
                    log(`[SITEMAP] Alt sitemap yüklenemedi: ${e.message}`)
                }
            }
        }
        
        log(`[SITEMAP] Toplam ${urls.length} URL bulundu`)
        return urls
    } catch (e) {
        log(`[SITEMAP] Hata: ${e.message}`)
        return []
    }
}

async function getSitemapUrl(baseUrl) {
    // Olası sitemap URL'lerini dene
    var possibleUrls = [
        `${baseUrl}/sitemap.xml`,
        `${baseUrl}/sitemap_index.xml`,
        `${baseUrl}/sitemap1.xml`,
        `${baseUrl}/robots.txt` // robots.txt'ten sitemap URL'ini al
    ]
    
    // Önce robots.txt'ten sitemap URL'ini almayı dene
    try {
        var robotsContent = await fetchSitemap(`${baseUrl}/robots.txt`)
        var sitemapMatch = robotsContent.match(/Sitemap:\s*(.*)/i)
        if (sitemapMatch && sitemapMatch[1]) {
            var sitemapUrl = sitemapMatch[1].trim()
            log(`[SITEMAP] robots.txt'ten sitemap URL bulundu: ${sitemapUrl}`)
            return sitemapUrl
        }
    } catch (e) {
        // robots.txt yoksa devam et
    }
    
    // Olası URL'leri dene
    for (var i = 0; i < possibleUrls.length; i++) {
        try {
            await fetchSitemap(possibleUrls[i])
            log(`[SITEMAP] Sitemap bulundu: ${possibleUrls[i]}`)
            return possibleUrls[i]
        } catch (e) {
            // Bu URL çalışmıyor, bir sonrakini dene
        }
    }
    
    return null
}

async function browsePages(driver, baseUrl, minTime, maxTime) {
    try {
        var currentUrl = await driver.getCurrentUrl()
        log(`  → Şu anki sayfa: ${currentUrl}`)
        
        // Sayfayı scroll et
        await driver.executeScript(auto.scroll())
        await delay(random(2000, 4000))
        
        // Sayfadaki linkleri bul
        var links = await driver.findElements(webDriver.By.css('a[href]'))
        var validLinks = []
        
        for (var i = 0; i < links.length; i++) {
            try {
                var href = await links[i].getAttribute('href')
                if (href) {
                    // Relative linkleri tam URL'ye çevir
                    var fullUrl = href
                    if (href.startsWith('/')) {
                        fullUrl = baseUrl + href
                    } else if (!href.startsWith('http')) {
                        try {
                            var currentUrlObj = new URL(currentUrl)
                            fullUrl = currentUrlObj.origin + '/' + href.replace(/^\.\//, '')
                        } catch (e) {
                            fullUrl = baseUrl + '/' + href
                        }
                    }
                    
                    // Sadece aynı domain içindeki linkleri al
                    if (fullUrl.startsWith(baseUrl) && fullUrl !== currentUrl) {
                        // Aynı sayfaya gitmeyi önle ve anchor linklerini filtrele
                        if (!fullUrl.includes('#') || fullUrl.split('#')[0] !== currentUrl.split('#')[0]) {
                            var linkText = await links[i].getText().catch(() => '')
                            if (linkText.trim().length > 0 || href.length > 0) {
                                validLinks.push({element: links[i], href: fullUrl})
                            }
                        }
                    }
                }
            } catch (e) {
                // Link okunamazsa devam et
            }
        }
        
        if (validLinks.length > 0) {
            // Rastgele bir link seç
            var randomLink = validLinks[random(0, validLinks.length - 1)]
            var targetUrl = randomLink.href
            
            log(`  → Yeni sayfaya geçiliyor: ${targetUrl}`)
            
            try {
                // Linke tıkla
                await randomLink.element.click()
                await delay(random(2000, 4000))
                
                // Rastgele süre bekle (min-max arası)
                var waitTime = getRandomTime(minTime, maxTime)
                var waitSeconds = Math.floor(waitTime / 1000)
                log(`  → Sayfada ${waitSeconds} saniye kalınıyor...`)
                
                // Bekleme sırasında scroll yap
                var scrollInterval = setInterval(async () => {
                    try {
                        await driver.executeScript(auto.scroll())
                    } catch (e) {
                        clearInterval(scrollInterval)
                    }
                }, 3000)
                
                await delay(waitTime)
                clearInterval(scrollInterval)
                
                log(`  → ${waitSeconds} saniye tamamlandı, sayfa gezintisi devam ediyor...`)
                
                // Tekrar sayfa gezintisi yap (maksimum 3-5 sayfa)
                var maxPages = random(2, 4)
                var currentPage = 1
                
                while (currentPage < maxPages) {
                    await delay(random(1000, 2000))
                    var newLinks = await driver.findElements(webDriver.By.css('a[href]'))
                    var newValidLinks = []
                    
                    try {
                        var newCurrentUrl = await driver.getCurrentUrl()
                        for (var j = 0; j < newLinks.length; j++) {
                            try {
                                var newHref = await newLinks[j].getAttribute('href')
                                if (newHref) {
                                    // Relative linkleri tam URL'ye çevir
                                    var newFullUrl = newHref
                                    if (newHref.startsWith('/')) {
                                        newFullUrl = baseUrl + newHref
                                    } else if (!newHref.startsWith('http')) {
                                        try {
                                            var newCurrentUrlObj = new URL(newCurrentUrl)
                                            newFullUrl = newCurrentUrlObj.origin + '/' + newHref.replace(/^\.\//, '')
                                        } catch (e) {
                                            newFullUrl = baseUrl + '/' + newHref
                                        }
                                    }
                                    
                                    if (newFullUrl.startsWith(baseUrl) && newFullUrl !== newCurrentUrl) {
                                        if (!newFullUrl.includes('#') || newFullUrl.split('#')[0] !== newCurrentUrl.split('#')[0]) {
                                            newValidLinks.push({element: newLinks[j], href: newFullUrl})
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                        
                        if (newValidLinks.length > 0) {
                            var nextRandomLink = newValidLinks[random(0, newValidLinks.length - 1)]
                            log(`  → Sayfa ${currentPage + 1}/${maxPages}: ${nextRandomLink.href}`)
                            await nextRandomLink.element.click()
                            await delay(random(2000, 4000))
                            await driver.executeScript(auto.scroll())
                            await delay(random(1000, 2000))
                            currentPage++
                        } else {
                            break
                        }
                    } catch (e) {
                        log(`  → Sayfa gezintisi hatası: ${e.message}`)
                        break
                    }
                }
                
                log(`  → Toplam ${currentPage} sayfa gezildi`)
            } catch (e) {
                log(`  → Link tıklama hatası: ${e.message}`)
            }
        } else {
            log(`  → Gezilecek link bulunamadı, ana sayfada kalınıyor`)
        }
        
        // Son beklemeyi yap
        var finalWaitTime = getRandomTime(Math.floor(minTime / 2), Math.floor(maxTime / 2))
        var finalWaitSeconds = Math.floor(finalWaitTime / 1000)
        log(`  → Son beklemeyi yapıyor: ${finalWaitSeconds} saniye...`)
        await delay(finalWaitTime)
        
    } catch (e) {
        log(`  → Sayfa gezintisi genel hatası: ${e.message}`)
    }
}

function Stealth(driver){
    return new Promise(async function(resolve){
        var connection = await driver.createCDPConnection('page')
        await connection.execute('Runtime.enable', {}, null)
        await connection.execute('Page.enable', {}, null)
        await connection.execute("Page.addScriptToEvaluateOnNewDocument", {
            source: spoofing()
        }, null)
        resolve(true)
    })
}


function findSiteUrl(Driver, url){
    return new Promise(async (r) => {
        try {
            // Farklı selector'lar dene (Google'ın farklı sonuç formatları için)
            var selectors = [
                webDriver.By.className('yuRUbf'),
                webDriver.By.css('div[data-ved] a'),
                webDriver.By.css('div.g a'),
                webDriver.By.css('h3 a'),
                webDriver.By.xpath('//div[@class="g"]//a')
            ]
            
            var allLinks = []
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var elements = await Driver.findElements(selectors[s])
                    for (var i = 0; i < elements.length; i++) {
                        try {
                            var href = await elements[i].getAttribute('href')
                            if (href && href.includes(url.replace('https://', '').replace('http://', '').split('/')[0])) {
                                // URL eşleşmesi bulundu
                                var index = allLinks.length
                                allLinks.push({href: href, index: index})
                                if (href.match(url) || href.includes(new URL(url).hostname)) {
                                    return r(index)
                                }
                            }
                        } catch (e) {
                            continue
                        }
                    }
                } catch (e) {
                    continue
                }
            }
            
            // Eğer tam eşleşme bulunamadıysa, domain eşleşmesi ara
            var baseUrl = new URL(url).hostname.replace('www.', '')
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var elements = await Driver.findElements(selectors[s])
                    for (var i = 0; i < elements.length; i++) {
                        try {
                            var href = await elements[i].getAttribute('href')
                            if (href && (href.includes(baseUrl) || href.includes(url.replace('https://', '').replace('http://', '')))) {
                                return r(i)
                            }
                        } catch (e) {
                            continue
                        }
                    }
                } catch (e) {
                    continue
                }
            }
            
            r(-1)
        } catch (e) {
            r(-1)
        }
    });
}

function nextPage(Driver, url){
    return new Promise(async (r) => {
        try {
            // Sonuçları scroll et (Google'a sinyal göndermek için)
            await Driver.executeScript("window.scrollTo(0, document.body.scrollHeight)")
            await delay(1000)
            
            // Sonraki sayfa butonunu bul
            var nextPageSelectors = [
                webDriver.By.css('a[aria-label*="Next"]'),
                webDriver.By.css('a[aria-label*="Sonraki"]'),
                webDriver.By.css('a#pnnext'),
                webDriver.By.className('d6cvqb BBwThe'),
                webDriver.By.xpath('//a[@id="pnnext"]'),
                webDriver.By.xpath('//a[contains(@aria-label, "Next")]')
            ]
            
            var clicked = false
            for (var s = 0; s < nextPageSelectors.length; s++) {
                try {
                    var pages = await Driver.findElements(nextPageSelectors[s])
                    if (pages.length > 0) {
                        // İkinci sayfa butonunu bul (genelde [1] index'inde)
                        var pageButton = pages.length > 1 ? pages[1] : pages[0]
                        if (pageButton) {
                            await pageButton.click()
                            clicked = true
                            break
                        }
                    }
                } catch (e) {
                    continue
                }
            }
            
            if (!clicked) {
                // Buton bulunamadıysa scroll yap
                await Driver.executeScript("window.scrollBy(0, 800)")
            }
            
            await delay(2000)
            
            // Sonuçları tekrar scroll et
            await Driver.executeScript("window.scrollTo(0, document.body.scrollHeight / 2)")
            await delay(1000)
            
            var findURL = await findSiteUrl(Driver, url)
            await delay(2000)
            
            // Maksimum 3 sayfa ara (sonsuz döngüyü önlemek için)
            if (findURL == -1 && (typeof nextPage.attemptCount === 'undefined' || nextPage.attemptCount < 2)) {
                nextPage.attemptCount = (nextPage.attemptCount || 0) + 1
                var result = await nextPage(Driver, url)
                nextPage.attemptCount = 0 // Reset
                r(result)
            } else {
                nextPage.attemptCount = 0 // Reset
                r(findURL)
            }
        } catch (e) {
            r(-1)
        }
    });
}

function clickPage(Driver, page_id){
    return new Promise(async (r) => {
        try {
            // Farklı selector'lar dene
            var selectors = [
                webDriver.By.className('LC20lb MBeuO DKV0Md'),
                webDriver.By.css('h3 a'),
                webDriver.By.css('div.g h3 a'),
                webDriver.By.xpath('//h3//a')
            ]
            
            var clicked = false
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var sites = await Driver.findElements(selectors[s])
                    if (sites.length > page_id) {
                        // Mouse'u linkin üzerine getir (hover)
                        await Driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", sites[page_id])
                        await delay(random(500, 1000))
                        
                        // Tıkla
                        await sites[page_id].click()
                        clicked = true
                        break
                    }
                } catch (e) {
                    continue
                }
            }
            
            if (!clicked) {
                // Son çare: JavaScript ile tıkla
                try {
                    var allLinks = await Driver.findElements(webDriver.By.css('a[href]'))
                    if (allLinks.length > page_id) {
                        await Driver.executeScript("arguments[0].click();", allLinks[page_id])
                    }
                } catch (e) {
                    // Hata durumunda devam et
                }
            }
            
            await delay(random(1500, 2500))
            
            // Sayfa yüklendikten sonra scroll yap
            await Driver.executeScript(auto.scroll())
            
            r(true)
        } catch (e) {
            r(false)
        }
    });
}

var driverList = [];

async function browseSitemapPages(driver, sitemapUrls, minTime, maxTime, countIndex) {
    try {
        log(`[COUNT ${countIndex}] Sitemap'ten ${sitemapUrls.length} sayfa gezilecek`)
        
        // URL'leri karıştır (rastgele sıra)
        var shuffledUrls = [...sitemapUrls]
        for (var i = shuffledUrls.length - 1; i > 0; i--) {
            var j = random(0, i)
            var temp = shuffledUrls[i]
            shuffledUrls[i] = shuffledUrls[j]
            shuffledUrls[j] = temp
        }
        
        // Her sayfayı gez
        for (var pageIndex = 0; pageIndex < shuffledUrls.length; pageIndex++) {
            var pageUrl = shuffledUrls[pageIndex]
            log(`[COUNT ${countIndex}] Sayfa ${pageIndex + 1}/${shuffledUrls.length}: ${pageUrl}`)
            
            try {
                await driver.get(pageUrl)
                await delay(random(2000, 4000))
                
                // Sayfayı scroll et
                await driver.executeScript(auto.scroll())
                await delay(random(1000, 2000))
                
                // Rastgele süre bekle
                var waitTime = getRandomTime(minTime, maxTime)
                var waitSeconds = Math.floor(waitTime / 1000)
                log(`[COUNT ${countIndex}] Sayfada ${waitSeconds} saniye kalınıyor...`)
                
                // Bekleme sırasında scroll yap
                var scrollInterval = setInterval(async () => {
                    try {
                        await driver.executeScript(auto.scroll())
                    } catch (e) {
                        clearInterval(scrollInterval)
                    }
                }, 3000)
                
                await delay(waitTime)
                clearInterval(scrollInterval)
                
                log(`[COUNT ${countIndex}] ${waitSeconds} saniye tamamlandı`)
                
                // Sayfalar arası bekleme (belirli aralık)
                if (pageIndex < shuffledUrls.length - 1) {
                    var intervalWait = random(3000, 6000)
                    log(`[COUNT ${countIndex}] Sonraki sayfaya geçmeden önce ${Math.floor(intervalWait/1000)} saniye bekleniyor...`)
                    await delay(intervalWait)
                }
            } catch (e) {
                log(`[COUNT ${countIndex}] Sayfa yükleme hatası: ${e.message}`)
            }
        }
        
        log(`[COUNT ${countIndex}] Tüm sitemap sayfaları gezildi!`)
    } catch (e) {
        log(`[COUNT ${countIndex}] Sitemap gezintisi hatası: ${e.message}`)
    }
}

async function Direct(url, proxy, minTime, maxTime, useSitemap, countIndex){
    var options = new chrome.Options()
    var normalizedProxy = normalizeProxy(proxy)
    if (normalizedProxy) {
        options.addArguments(`--proxy-server=${normalizedProxy}`)
        log(`[COUNT ${countIndex}] [DIRECT] Başlatılıyor... URL: ${url} | Proxy: ${normalizedProxy}`)
    } else {
        if (proxy) {
            log(`[COUNT ${countIndex}] [DIRECT] Proxy desteklenmiyor veya geçersiz: ${proxy}, proxy olmadan devam ediliyor`)
        }
        log(`[COUNT ${countIndex}] [DIRECT] Başlatılıyor... URL: ${url}`)
    }
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    addHeadlessIfEnabled(options)
    var driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
    await Stealth(driver)
    
    try {
        var baseUrlObj = new URL(url)
        var baseUrl = baseUrlObj.origin
        
        if (useSitemap) {
            // Sitemap modu
            log(`[COUNT ${countIndex}] Sitemap modu aktif, sitemap aranıyor...`)
            var sitemapUrl = await getSitemapUrl(baseUrl)
            
            if (sitemapUrl) {
                var sitemapUrls = await parseSitemap(sitemapUrl)
                
                if (sitemapUrls.length > 0) {
                    log(`[COUNT ${countIndex}] ${sitemapUrls.length} sayfa bulundu, gezinti başlıyor...`)
                    await browseSitemapPages(driver, sitemapUrls, minTime, maxTime, countIndex)
                } else {
                    log(`[COUNT ${countIndex}] Sitemap'te URL bulunamadı, normal gezinti yapılıyor...`)
                    await driver.get(url)
                    await delay(2000)
                    await browsePages(driver, baseUrl, minTime, maxTime)
                }
            } else {
                log(`[COUNT ${countIndex}] Sitemap bulunamadı, normal gezinti yapılıyor...`)
                await driver.get(url)
                await delay(2000)
                await browsePages(driver, baseUrl, minTime, maxTime)
            }
        } else {
            // Normal mod
            await driver.get(url)
            log(`[COUNT ${countIndex}] Sayfa yüklendi, sayfa gezintisi başlıyor...`)
            await delay(2000)
            await browsePages(driver, baseUrl, minTime, maxTime)
        }
        
        driverList.push({driver: driver, time: Date.now()})
        log(`[COUNT ${countIndex}] [DIRECT] Başarılı! Toplam süre tamamlandı. (${driverList.length}/${usedDriver + 1})`)
        log(`[COUNT ${countIndex}] Chrome penceresi açık kalacak - manuel olarak kapatabilirsiniz veya Stop butonuna basın`)
    } catch (err) {
        log(`[COUNT ${countIndex}] [DIRECT] Hata: ${err.message}`)
        // Hata olsa bile driver'ı açık bırak
        try {
            driverList.push({driver: driver, time: Date.now()})
            log(`[COUNT ${countIndex}] Chrome penceresi açık kalacak`)
        } catch (e) {
            // Driver oluşturulamadıysa devam et
        }
    }
}

async function googleSearch(url, keyboard, proxy, minTime, maxTime, alwaysDirect){
    var options = new chrome.Options()
    // Google araması için proxy kullanma - proxy'ler Google'ı engelliyor
    // if (proxy)
    //     options.addArguments(`--proxy-server=http://${proxy}`)
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    addHeadlessIfEnabled(options)
    log(`[GOOGLE SEARCH] Başlatılıyor... Arama: "${keyboard}" | URL: ${url} | Proxy: Kapalı (Google için)`)
    var driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
    await Stealth(driver)
    
    try {
        await driver.get("https://www.google.com/")
        logI18n('logMessages.googleConnected')
        
        // Sayfa yüklenmesini bekle - document.readyState kontrolü
        await driver.wait(async () => {
            var readyState = await driver.executeScript('return document.readyState')
            return readyState === 'complete'
        }, 15000)
        
        await delay(3000) // Ekstra bekleme
        
        // Cookie kabul et (varsa) - daha fazla selector dene
        try {
            var acceptSelectors = [
                webDriver.By.css('button[id*="L2AGLb"]'),
                webDriver.By.css('.QS5gu'),
                webDriver.By.css('button[aria-label*="Accept"]'),
                webDriver.By.xpath('//button[contains(text(), "Accept")]'),
                webDriver.By.xpath('//button[contains(text(), "Kabul")]')
            ]
            
            for (var s = 0; s < acceptSelectors.length; s++) {
                try {
                    var accept_cookies = await driver.findElements(acceptSelectors[s])
                    if (accept_cookies.length > 0) {
                        var isDisplayed = await accept_cookies[0].isDisplayed()
                        if (isDisplayed) {
                            await accept_cookies[0].click()
                            await delay(2000)
                            break
                        }
                    }
                } catch (e) {
                    continue
                }
            }
        } catch (e) {
            // Cookie butonu yoksa devam et
        }
        
        await delay(2000) // Cookie sonrası bekleme
        
        // Arama kutusunu bul (birden fazla selector dene ve bekle)
        var searchBox = null
        var selectors = [
            webDriver.By.name('q'),
            webDriver.By.css('textarea[name="q"]'),
            webDriver.By.css('input[name="q"]'),
            webDriver.By.css('textarea[aria-label*="Search"]'),
            webDriver.By.css('textarea[aria-label*="Ara"]'),
            webDriver.By.className('gLFyf'),
            webDriver.By.id('APjFqb'),
            webDriver.By.xpath('//textarea[@name="q"]'),
            webDriver.By.xpath('//input[@name="q"]'),
            webDriver.By.css('textarea[type="search"]'),
            webDriver.By.css('input[type="search"]')
        ]
        
        // 15 saniye boyunca arama kutusunu bulmayı dene
        var found = false
        for (var attempt = 0; attempt < 15; attempt++) {
            for (var i = 0; i < selectors.length; i++) {
                try {
                    var elements = await driver.findElements(selectors[i])
                    if (elements.length > 0) {
                        for (var j = 0; j < elements.length; j++) {
                            try {
                                var isDisplayed = await elements[j].isDisplayed()
                                if (isDisplayed) {
                                    searchBox = elements[j]
                                    found = true
                                    break
                                }
                            } catch (e) {
                                continue
                            }
                        }
                        if (found) break
                    }
                } catch (e) {
                    continue
                }
            }
            if (found) break
            await delay(1000)
        }
        
        // Eğer hala bulunamadıysa, JavaScript ile direkt arama yap
        if (!searchBox) {
            log(`[GOOGLE SEARCH] Selenium ile bulunamadı, JavaScript ile deneniyor...`)
            try {
                var found = await driver.executeScript(`
                    var selectors = ['textarea[name="q"]', 'input[name="q"]', 'textarea[aria-label*="Search"]', 'textarea[aria-label*="Ara"]'];
                    for (var i = 0; i < selectors.length; i++) {
                        var el = document.querySelector(selectors[i]);
                        if (el && el.offsetParent !== null) {
                            el.focus();
                            el.value = arguments[0];
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            if (el.form) {
                                el.form.submit();
                            } else {
                                el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                                el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
                            }
                            return true;
                        }
                    }
                    return false;
                `, keyboard)
                
                if (found) {
                    await delay(3000)
                    log(`[GOOGLE SEARCH] JavaScript ile arama yapıldı`)
                } else {
                    // Son çare: URL ile direkt arama yap
                    log(`[GOOGLE SEARCH] Element bulunamadı, URL ile arama yapılıyor...`)
                    var searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyboard)}`
                    await driver.get(searchUrl)
                    await delay(3000)
                    log(`[GOOGLE SEARCH] URL ile arama yapıldı`)
                }
            } catch (e) {
                // URL ile arama yap
                log(`[GOOGLE SEARCH] JavaScript hatası, URL ile arama yapılıyor: ${e.message}`)
                var searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyboard)}`
                await driver.get(searchUrl)
                await delay(3000)
            }
        } else {
            logI18n('logMessages.googleSearching')
            try {
                await searchBox.clear()
            } catch (e) {
                // Clear başarısız olursa devam et
            }
            await searchBox.sendKeys(keyboard)
            await delay(500)
            await searchBox.sendKeys(webDriver.Key.RETURN)
        }
        
        await delay(2000)
        
        // Google sonuçlarını scroll et (Google'a sinyal göndermek için)
        logI18n('logMessages.googleScrolling')
        await driver.executeScript("window.scrollTo(0, document.body.scrollHeight / 2)")
        await delay(random(2000, 3000))
        await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)")
        await delay(random(1000, 2000))
        await driver.executeScript("window.scrollTo(0, 0)")
        await delay(1000)
        
        logI18n('logMessages.googleSearchingUrl')
        var pageId = await findSiteUrl(driver, url)
        var currentPage = 1
        await delay(2000)
        
        // Eğer ilk sayfada bulunamadıysa, birkaç sayfa daha dene
        if (pageId == -1) {
            logI18n('logMessages.googleNotFoundFirstPage')
            pageId = await nextPage(driver, url)
            currentPage = 2
        }
        
        // Eğer hala bulunamadıysa, direkt siteye git (ama Google'da arama yapılmış oldu - SEO için önemli)
        if (pageId == -1) {
            logI18n('logMessages.googleNotFound')
            logI18n('logMessages.googleNote')
            // Sıralama bulunamadı, kaydet
            recordRanking(url, keyboard, -1, currentPage, 'google')
            await driver.get(url)
            await delay(2000)
        } else {
            // Site bulundu, sıralamayı kaydet
            var position = pageId + 1 + ((currentPage - 1) * 10) // Sayfa başına ~10 sonuç
            recordRanking(url, keyboard, position, currentPage, 'google')
            logI18n('logMessages.googleFound', {position: position})
            await delay(1000)
            await clickPage(driver, pageId)
        }
        
        // Hedef siteye ulaşıldı, sayfa gezintisi başlıyor
        logI18n('logMessages.googleReached')
        await delay(2000)
        
        // Base URL'i al
        var baseUrlObj = new URL(url)
        var baseUrl = baseUrlObj.origin
        
        // Sayfa gezintisi yap
        await browsePages(driver, baseUrl, minTime, maxTime)
        
        logI18n('logMessages.googleSuccess')
        return driver // Driver'ı döndür
    } catch (err) {
        logI18n('logMessages.googleError', {error: err.message})
        if (driver) {
            try { await driver.quit() } catch (e) {}
        }
        throw err
    }
}

// Bing Arama
async function bingSearch(url, keyboard, proxy, minTime, maxTime, alwaysDirect) {
    var options = new chrome.Options()
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    addHeadlessIfEnabled(options)
    logI18n('logMessages.bingStarting', {keyword: keyboard, url: url})
    var driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
    await Stealth(driver)
    
    try {
        var searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(keyboard)}`
        await driver.get(searchUrl)
        await delay(3000)
        
        logI18n('logMessages.bingScrolling')
        await driver.executeScript("window.scrollTo(0, document.body.scrollHeight / 2)")
        await delay(random(2000, 3000))
        
        // Bing sonuçlarında URL ara
        var pageId = await findSiteUrlBing(driver, url)
        await delay(2000)
        
        if (pageId == -1) {
            logI18n('logMessages.bingNotFound')
            await driver.get(url)
            await delay(2000)
        } else {
            logI18n('logMessages.bingFound', {position: pageId + 1})
            await clickPageBing(driver, pageId)
        }
        
        var baseUrlObj = new URL(url)
        var baseUrl = baseUrlObj.origin
        await browsePages(driver, baseUrl, minTime, maxTime)
        
        logI18n('logMessages.bingSuccess')
        return driver
    } catch (err) {
        logI18n('logMessages.bingError', {error: err.message})
        if (driver) {
            try { await driver.quit() } catch (e) {}
        }
        throw err
    }
}

// Yahoo Arama
async function yahooSearch(url, keyboard, proxy, minTime, maxTime, alwaysDirect) {
    var options = new chrome.Options()
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    addHeadlessIfEnabled(options)
    logI18n('logMessages.yahooStarting', {keyword: keyboard, url: url})
    var driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
    await Stealth(driver)
    
    try {
        var searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(keyboard)}`
        await driver.get(searchUrl)
        await delay(3000)
        
        logI18n('logMessages.yahooScrolling')
        await driver.executeScript("window.scrollTo(0, document.body.scrollHeight / 2)")
        await delay(random(2000, 3000))
        
        var pageId = await findSiteUrlYahoo(driver, url)
        await delay(2000)
        
        if (pageId == -1) {
            logI18n('logMessages.yahooNotFound')
            await driver.get(url)
            await delay(2000)
        } else {
            logI18n('logMessages.yahooFound', {position: pageId + 1})
            await clickPageYahoo(driver, pageId)
        }
        
        var baseUrlObj = new URL(url)
        var baseUrl = baseUrlObj.origin
        await browsePages(driver, baseUrl, minTime, maxTime)
        
        logI18n('logMessages.yahooSuccess')
        return driver
    } catch (err) {
        logI18n('logMessages.yahooError', {error: err.message})
        if (driver) {
            try { await driver.quit() } catch (e) {}
        }
        throw err
    }
}

// DuckDuckGo Arama
async function duckDuckGoSearch(url, keyboard, proxy, minTime, maxTime, alwaysDirect) {
    var options = new chrome.Options()
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    addHeadlessIfEnabled(options)
    logI18n('logMessages.duckduckgoStarting', {keyword: keyboard, url: url})
    var driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
    await Stealth(driver)
    
    try {
        var searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyboard)}`
        await driver.get(searchUrl)
        await delay(3000)
        
        logI18n('logMessages.duckduckgoScrolling')
        await driver.executeScript("window.scrollTo(0, document.body.scrollHeight / 2)")
        await delay(random(2000, 3000))
        
        var pageId = await findSiteUrlDuckDuckGo(driver, url)
        await delay(2000)
        
        if (pageId == -1) {
            logI18n('logMessages.duckduckgoNotFound')
            await driver.get(url)
            await delay(2000)
        } else {
            logI18n('logMessages.duckduckgoFound', {position: pageId + 1})
            await clickPageDuckDuckGo(driver, pageId)
        }
        
        var baseUrlObj = new URL(url)
        var baseUrl = baseUrlObj.origin
        await browsePages(driver, baseUrl, minTime, maxTime)
        
        logI18n('logMessages.duckduckgoSuccess')
        return driver
    } catch (err) {
        logI18n('logMessages.duckduckgoError', {error: err.message})
        if (driver) {
            try { await driver.quit() } catch (e) {}
        }
        throw err
    }
}

// Yandex Arama
async function yandexSearch(url, keyboard, proxy, minTime, maxTime, alwaysDirect) {
    var options = new chrome.Options()
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    addHeadlessIfEnabled(options)
    logI18n('logMessages.yandexStarting', {keyword: keyboard, url: url})
    var driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
    await Stealth(driver)
    
    try {
        var searchUrl = `https://yandex.com/search/?text=${encodeURIComponent(keyboard)}`
        await driver.get(searchUrl)
        await delay(3000)
        
        logI18n('logMessages.yandexScrolling')
        await driver.executeScript("window.scrollTo(0, document.body.scrollHeight / 2)")
        await delay(random(2000, 3000))
        
        var pageId = await findSiteUrlYandex(driver, url)
        await delay(2000)
        
        if (pageId == -1) {
            logI18n('logMessages.yandexNotFound')
            await driver.get(url)
            await delay(2000)
        } else {
            logI18n('logMessages.yandexFound', {position: pageId + 1})
            await clickPageYandex(driver, pageId)
        }
        
        var baseUrlObj = new URL(url)
        var baseUrl = baseUrlObj.origin
        await browsePages(driver, baseUrl, minTime, maxTime)
        
        logI18n('logMessages.yandexSuccess')
        return driver
    } catch (err) {
        logI18n('logMessages.yandexError', {error: err.message})
        if (driver) {
            try { await driver.quit() } catch (e) {}
        }
        throw err
    }
}

// Helper functions for different search engines
async function findSiteUrlBing(driver, url) {
    return new Promise(async (r) => {
        try {
            var selectors = [
                webDriver.By.css('h2 a'),
                webDriver.By.css('li.b_algo h2 a'),
                webDriver.By.css('a[href]')
            ]
            
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var elements = await driver.findElements(selectors[s])
                    for (var i = 0; i < elements.length; i++) {
                        try {
                            var href = await elements[i].getAttribute('href')
                            if (href && (href.includes(new URL(url).hostname) || href.includes(url.replace('https://', '').replace('http://', '')))) {
                                return r(i)
                            }
                        } catch (e) {
                            continue
                        }
                    }
                } catch (e) {
                    continue
                }
            }
            r(-1)
        } catch (e) {
            r(-1)
        }
    })
}

async function clickPageBing(driver, page_id) {
    return new Promise(async (r) => {
        try {
            var selectors = [
                webDriver.By.css('h2 a'),
                webDriver.By.css('li.b_algo h2 a')
            ]
            
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var sites = await driver.findElements(selectors[s])
                    if (sites.length > page_id) {
                        await driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", sites[page_id])
                        await delay(random(500, 1000))
                        await sites[page_id].click()
                        await delay(random(1500, 2500))
                        await driver.executeScript(auto.scroll())
                        return r(true)
                    }
                } catch (e) {
                    continue
                }
            }
            r(false)
        } catch (e) {
            r(false)
        }
    })
}

async function findSiteUrlYahoo(driver, url) {
    return new Promise(async (r) => {
        try {
            var selectors = [
                webDriver.By.css('h3 a'),
                webDriver.By.css('div.dd a'),
                webDriver.By.css('a[href]')
            ]
            
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var elements = await driver.findElements(selectors[s])
                    for (var i = 0; i < elements.length; i++) {
                        try {
                            var href = await elements[i].getAttribute('href')
                            if (href && (href.includes(new URL(url).hostname) || href.includes(url.replace('https://', '').replace('http://', '')))) {
                                return r(i)
                            }
                        } catch (e) {
                            continue
                        }
                    }
                } catch (e) {
                    continue
                }
            }
            r(-1)
        } catch (e) {
            r(-1)
        }
    })
}

async function clickPageYahoo(driver, page_id) {
    return new Promise(async (r) => {
        try {
            var selectors = [
                webDriver.By.css('h3 a'),
                webDriver.By.css('div.dd a')
            ]
            
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var sites = await driver.findElements(selectors[s])
                    if (sites.length > page_id) {
                        await driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", sites[page_id])
                        await delay(random(500, 1000))
                        await sites[page_id].click()
                        await delay(random(1500, 2500))
                        await driver.executeScript(auto.scroll())
                        return r(true)
                    }
                } catch (e) {
                    continue
                }
            }
            r(false)
        } catch (e) {
            r(false)
        }
    })
}

async function findSiteUrlDuckDuckGo(driver, url) {
    return new Promise(async (r) => {
        try {
            var selectors = [
                webDriver.By.css('h2 a'),
                webDriver.By.css('a.result__a'),
                webDriver.By.css('a[href]')
            ]
            
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var elements = await driver.findElements(selectors[s])
                    for (var i = 0; i < elements.length; i++) {
                        try {
                            var href = await elements[i].getAttribute('href')
                            if (href && (href.includes(new URL(url).hostname) || href.includes(url.replace('https://', '').replace('http://', '')))) {
                                return r(i)
                            }
                        } catch (e) {
                            continue
                        }
                    }
                } catch (e) {
                    continue
                }
            }
            r(-1)
        } catch (e) {
            r(-1)
        }
    })
}

async function clickPageDuckDuckGo(driver, page_id) {
    return new Promise(async (r) => {
        try {
            var selectors = [
                webDriver.By.css('h2 a'),
                webDriver.By.css('a.result__a')
            ]
            
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var sites = await driver.findElements(selectors[s])
                    if (sites.length > page_id) {
                        await driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", sites[page_id])
                        await delay(random(500, 1000))
                        await sites[page_id].click()
                        await delay(random(1500, 2500))
                        await driver.executeScript(auto.scroll())
                        return r(true)
                    }
                } catch (e) {
                    continue
                }
            }
            r(false)
        } catch (e) {
            r(false)
        }
    })
}

async function findSiteUrlYandex(driver, url) {
    return new Promise(async (r) => {
        try {
            var selectors = [
                webDriver.By.css('h2 a'),
                webDriver.By.css('li.serp-item h2 a'),
                webDriver.By.css('a[href]')
            ]
            
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var elements = await driver.findElements(selectors[s])
                    for (var i = 0; i < elements.length; i++) {
                        try {
                            var href = await elements[i].getAttribute('href')
                            if (href && (href.includes(new URL(url).hostname) || href.includes(url.replace('https://', '').replace('http://', '')))) {
                                return r(i)
                            }
                        } catch (e) {
                            continue
                        }
                    }
                } catch (e) {
                    continue
                }
            }
            r(-1)
        } catch (e) {
            r(-1)
        }
    })
}

async function clickPageYandex(driver, page_id) {
    return new Promise(async (r) => {
        try {
            var selectors = [
                webDriver.By.css('h2 a'),
                webDriver.By.css('li.serp-item h2 a')
            ]
            
            for (var s = 0; s < selectors.length; s++) {
                try {
                    var sites = await driver.findElements(selectors[s])
                    if (sites.length > page_id) {
                        await driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", sites[page_id])
                        await delay(random(500, 1000))
                        await sites[page_id].click()
                        await delay(random(1500, 2500))
                        await driver.executeScript(auto.scroll())
                        return r(true)
                    }
                } catch (e) {
                    continue
                }
            }
            r(false)
        } catch (e) {
            r(false)
        }
    })
}

async function proxyServer(url, keyboard, minTime, maxTime){
    var options = new chrome.Options()
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    addHeadlessIfEnabled(options)
    log(`[PROXY SERVER] Başlatılıyor... Arama: "${keyboard}" | URL: ${url}`)
    var driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
    await Stealth(driver)
    await driver.get('https://www.blockaway.net').then(async()=>{
        log(`[PROXY SERVER] Proxy sunucusuna bağlanılıyor...`)
        await driver.findElement(webDriver.By.id('url')).sendKeys('https://www.google.com/')
        await driver.findElement(webDriver.By.id('requestSubmit')).click()
        log(`[PROXY SERVER] Proxy bağlantısı bekleniyor (12 saniye)...`)
        await delay(12000)
        var accept_cookies = await driver.findElements(webDriver.By.className('QS5gu sy4vM'))
        await accept_cookies[0]?.click()
        await driver.findElement(webDriver.By.className('gLFyf')).sendKeys(keyboard)
        var elements = await driver.findElements(webDriver.By.className('gNO89b'))
        await elements[1].click()
        await delay(1000)
        log(`[PROXY SERVER] Sonuçlarda URL aranıyor...`)
        var pageId = await findSiteUrl(driver, url)
        await delay(2000)
        if (pageId == -1) {
            log(`[PROXY SERVER] İlk sayfada bulunamadı, sonraki sayfaya geçiliyor...`)
            pageId = await nextPage(driver, url)
        }
        await delay(1000)
        log(`[PROXY SERVER] Sayfa ID: ${pageId}`)
        await clickPage(driver, pageId)
        
        // Hedef siteye ulaşıldı, sayfa gezintisi başlıyor
        log(`[PROXY SERVER] Hedef siteye ulaşıldı, sayfa gezintisi başlıyor...`)
        await delay(2000)
        
        // Base URL'i al
        var baseUrlObj = new URL(url)
        var baseUrl = baseUrlObj.origin
        
        // Sayfa gezintisi yap
        await browsePages(driver, baseUrl, minTime, maxTime)
        
        driverList.push({driver: driver, time: Date.now()})
        log(`[PROXY SERVER] Başarılı! Toplam süre tamamlandı. (${driverList.length}/${usedDriver + 1})`)
    }).catch((err) => {
        log(`[PROXY SERVER] Hata: ${err.message}`)
    })
}



var usedDriver = 0
async function driverTimeout(){
    // Driver'ları otomatik kapatmayı devre dışı bırak - pencereler açık kalsın
    // Kullanıcı manuel olarak kapatabilir veya Stop butonuna basabilir
    // setInterval(async () => {
    //     if (driverList.length > 0)
    //         for (var i = 0; i < driverList.length; i++){
    //             if(Date.now() - driverList[i].time > 60000){
    //                 await driverList[i].driver.quit()
    //                 driverList.splice(i, 1)
    //             }
    //         }
    // }, 4000);
}


async function main(url, keyboard, count, option, minTime, maxTime, useSitemap){
    usedDriver = 0
    driverTimeout()
    log(`========================================`)
    logI18n('logMessages.processStarting')
    logI18n('logMessages.mode', {mode: option})
    log(`URL: ${url}`)
    logI18n('logMessages.total', {count: count})
    logI18n('logMessages.minTime', {time: minTime})
    logI18n('logMessages.maxTime', {time: maxTime})
    logI18n('logMessages.sitemapMode', {status: useSitemap ? 'Aktif' : 'Kapalı'})
    log(`========================================`)
    var proxy = await loadproxy()
    // Desteklenen proxy'leri filtrele (SOCKS4'ü hariç tut)
    var validProxies = []
    if (proxy.length > 0) {
        proxy.forEach(p => {
            var normalized = normalizeProxy(p)
            if (normalized) {
                validProxies.push(p) // Orijinal proxy string'ini sakla (normalizeProxy fonksiyonu içinde normalize edilecek)
            }
        })
        if (validProxies.length > 0) {
            logI18n('logMessages.proxyListLoaded', {count: validProxies.length})
            if (validProxies.length < proxy.length) {
                log(`Uyarı: ${proxy.length - validProxies.length} proxy desteklenmiyor (SOCKS4 vb.) ve atlandı`)
            }
        } else {
            log(`Uyarı: ${proxy.length} proxy yüklendi ancak hiçbiri desteklenmiyor`)
        }
    } else {
        logI18n('logMessages.proxyListNotFound')
    }
    if (option == "Direct"){
        logI18n('logMessages.directStarting', {url: url})
        while (usedDriver != count && usedDriver < count){
            var proxyToUse = validProxies.length > 0 ? validProxies[usedDriver % validProxies.length] : null
            await Direct(url, proxyToUse, minTime, maxTime, useSitemap, usedDriver + 1)
            usedDriver += 1
        }
        logI18n('logMessages.directCompleted')
    }else if (option == "Google"){
        logI18n('logMessages.googleSearchStarting', {url: url, keyword: keyboard})
        while (usedDriver != count && usedDriver < count){
            var proxyToUse = validProxies.length > 0 ? validProxies[usedDriver % validProxies.length] : null
            await googleSearch(url, keyboard, proxyToUse, minTime, maxTime)
            usedDriver += 1
        }
        logI18n('logMessages.googleSearchCompleted')
    }else if (option == "Proxy"){
        logI18n('logMessages.proxyServerStarting', {url: url, keyword: keyboard})
        while (usedDriver != count && usedDriver < count){
            await proxyServer(url, keyboard, minTime, maxTime)
            usedDriver += 1
        }
        logI18n('logMessages.proxyServerCompleted')
    }
}

async function stop(){
    log(`[STOP] İşlem durduruluyor...`)
    isRunning = false
    
    // Zamanlayıcıyı durdur
    if (visitInterval) {
        clearInterval(visitInterval)
        visitInterval = null
    }
    
    // Tüm planlanmış ziyaretleri iptal et
    scheduledVisits = []
    
    // Tüm açık driver'ları kapat
    var driverCount = driverList.length
    log(`[STOP] ${driverCount} driver kapatılıyor...`)
    
    for (var i = driverList.length - 1; i >= 0; i--){
        try {
            await driverList[i].driver.quit()
            log(`[STOP] Driver ${i + 1}/${driverCount} kapatıldı`)
        } catch (e) {
            // Driver zaten kapatılmış olabilir
        }
        driverList.splice(i, 1)
    }
    
    driverList = []
    log(`[STOP] Tüm driver'lar kapatıldı`)
}

function setLogCallback(callback) {
    logCallback = callback
}

function setVisitCallback(callback) {
    visitCallback = callback
}

function setRankingCallback(callback) {
    rankingCallback = callback
}

// Sitemap kontrolü
async function checkSitemap(url) {
    try {
        var baseUrlObj = new URL(url)
        var baseUrl = baseUrlObj.origin
        var sitemapUrl = await getSitemapUrl(baseUrl)
        if (sitemapUrl) {
            var urls = await parseSitemap(sitemapUrl)
            return urls.length
        }
        return 0
    } catch (e) {
        log(`Sitemap kontrolü hatası: ${e.message}`)
        return 0
    }
}

// Zamanlama sistemi - ziyaretleri planla
function scheduleVisits(config) {
    var startTime = new Date(config.startTime)
    var endTime = new Date(config.endTime)
    var visitorCount = config.visitorCount
    var distributionType = config.distributionType
    
    scheduledVisits = []
    var totalMinutes = (endTime - startTime) / (1000 * 60)
    
    if (distributionType === 'hourly') {
        var hours = Math.ceil(totalMinutes / 60)
        var visitorsPerHour = Math.ceil(visitorCount / hours)
        var currentTime = new Date(startTime)
        
        while (currentTime < endTime && scheduledVisits.length < visitorCount) {
            var hourEnd = new Date(currentTime)
            hourEnd.setHours(hourEnd.getHours() + 1)
            if (hourEnd > endTime) hourEnd = endTime
            
            var visitorsThisHour = Math.min(visitorsPerHour, visitorCount - scheduledVisits.length)
            for (var i = 0; i < visitorsThisHour; i++) {
                var randomMinute = random(0, Math.floor((hourEnd - currentTime) / (1000 * 60)))
                var visitTime = new Date(currentTime)
                visitTime.setMinutes(visitTime.getMinutes() + randomMinute)
                if (visitTime < endTime) {
                    scheduledVisits.push({
                        time: visitTime,
                        config: config,
                        executed: false
                    })
                }
            }
            currentTime = hourEnd
        }
    } else { // daily - günlük dağılım
        var visitorsPerMinute = visitorCount / totalMinutes
        var currentTime = new Date(startTime)
        var now = new Date()
        
        // Eğer başlangıç zamanı geçmişteyse, ilk ziyareti hemen planla
        if (currentTime < now) {
            currentTime = new Date(now)
            // İlk birkaç ziyareti hemen planla
            var immediateVisits = Math.min(5, visitorCount)
            for (var i = 0; i < immediateVisits; i++) {
                var immediateTime = new Date(now)
                immediateTime.setSeconds(immediateTime.getSeconds() + (i * 10)) // 10 saniye arayla
                if (immediateTime < endTime) {
                    scheduledVisits.push({
                        time: immediateTime,
                        config: config,
                        executed: false
                    })
                }
            }
        }
        
        while (currentTime < endTime && scheduledVisits.length < visitorCount) {
            var nextVisit = new Date(currentTime)
            var minutesToAdd = Math.max(1, Math.ceil(1 / visitorsPerMinute))
            nextVisit.setMinutes(nextVisit.getMinutes() + minutesToAdd)
            
            if (nextVisit < endTime) {
                scheduledVisits.push({
                    time: nextVisit,
                    config: config,
                    executed: false
                })
                currentTime = nextVisit
            } else {
                break
            }
        }
    }
    
    // Zamanına göre sırala
    scheduledVisits.sort((a, b) => a.time - b.time)
    log(`Toplam ${scheduledVisits.length} ziyaret planlandı`)
}

// Ziyaret zamanlayıcı
function startScheduler() {
    if (visitInterval) clearInterval(visitInterval)
    
    log(`Zamanlayıcı başlatıldı, ${scheduledVisits.length} ziyaret planlandı`)
    
    visitInterval = setInterval(() => {
        var now = new Date()
        var toExecute = scheduledVisits.filter(v => v.time <= now && !v.executed)
        
        if (toExecute.length > 0) {
            log(`${toExecute.length} ziyaret çalıştırılıyor...`)
        }
        
        toExecute.forEach(visit => {
            visit.executed = true
            executeVisit(visit.config, visit.time).catch(err => {
                log(`Ziyaret çalıştırma hatası: ${err.message}`)
            })
        })
        
        // Tüm ziyaretler tamamlandıysa durdur (sadece executed olanları say)
        var executedCount = scheduledVisits.filter(v => v.executed).length
        var totalCount = scheduledVisits.length
        
        if (executedCount === totalCount && totalCount > 0) {
            log(`Tüm planlanmış ziyaretler tamamlandı (${executedCount}/${totalCount})`)
            isRunning = false
            if (visitInterval) {
                clearInterval(visitInterval)
                visitInterval = null
            }
        } else if (totalCount > 0) {
            // İlerleme durumunu göster
            var pendingCount = scheduledVisits.filter(v => !v.executed && v.time > now).length
            var readyCount = scheduledVisits.filter(v => !v.executed && v.time <= now).length
            if (readyCount > 0 || executedCount % 10 === 0) {
                // Her 10 ziyarette bir veya hazır ziyaret varsa log göster
            }
        }
    }, 1000) // Her saniye kontrol et
}

// Tek bir ziyareti çalıştır
async function executeVisit(config, scheduledTime) {
    var isNewVisitor = Math.random() * 100 < config.newVisitorRate
    var searchKeyword = config.searchKeywords[random(0, config.searchKeywords.length - 1)]
    var searchEngine = config.searchEngine || 'google'
    var alwaysDirect = config.alwaysDirect !== false // Varsayılan true
    
    log(`Ziyaret başlatılıyor - ${isNewVisitor ? 'Yeni' : 'Dönen'} ziyaretçi - Arama: "${searchKeyword}"`)
    
    // Eğer "Sadece Direkt Git" seçildiyse veya arama motoru "direct" ise
    if (searchEngine === 'direct') {
        log(`Direkt ziyaret modu seçildi`)
        await executeDirectVisit(config)
        // recordVisit() executeDirectVisit içinde çağrılıyor
    }
    // Yeni ziyaretçi ise arama motorundan, değilse direkt
    else if (isNewVisitor && searchKeyword && searchEngine !== 'direct') {
        await executeSearchVisit(config, searchKeyword, searchEngine, alwaysDirect)
        // recordVisit() executeSearchVisit içinde çağrılıyor
    } else {
        await executeDirectVisit(config)
        // recordVisit() executeDirectVisit içinde çağrılıyor
    }
}

// Arama motoru ziyareti
async function executeSearchVisit(config, keyword, engine, alwaysDirect) {
    var driver = null
    try {
        // Proxy kullanmadan Google araması yap (proxy'ler Google'ı engelliyor olabilir)
        var useProxy = false // Google araması için proxy kullanma
        var proxy = null
        
        var totalTimeMinutes = random(config.totalMinTime, config.totalMaxTime)
        var totalTimeMs = totalTimeMinutes * 60 * 1000
        var startTime = Date.now()
        var pageCount = config.pageCount || 10
        
        // Arama motoruna göre fonksiyon çağır
        try {
            if (engine === 'google') {
                driver = await googleSearch(config.url, keyword, proxy, config.pageMinTime, config.pageMaxTime, alwaysDirect)
            } else if (engine === 'bing') {
                driver = await bingSearch(config.url, keyword, proxy, config.pageMinTime, config.pageMaxTime, alwaysDirect)
            } else if (engine === 'yahoo') {
                driver = await yahooSearch(config.url, keyword, proxy, config.pageMinTime, config.pageMaxTime, alwaysDirect)
            } else if (engine === 'duckduckgo') {
                driver = await duckDuckGoSearch(config.url, keyword, proxy, config.pageMinTime, config.pageMaxTime, alwaysDirect)
            } else if (engine === 'yandex') {
                driver = await yandexSearch(config.url, keyword, proxy, config.pageMinTime, config.pageMaxTime, alwaysDirect)
            } else {
                log(`[${engine.toUpperCase()}] Arama motoru desteklenmiyor, direkt ziyaret yapılıyor`)
                await executeDirectVisit(config)
                return
            }
            
            // Driver'ı listeye ekle (stop butonu için)
            if (driver) {
                driverList.push({driver: driver, time: Date.now()})
            }
            log(`Arama ziyareti tamamlandı - Toplam süre: ${Math.floor((Date.now() - startTime) / 1000)} saniye`)
        } catch (err) {
            log(`Arama ziyareti hatası: ${err.message}, direkt ziyaret deneniyor...`)
            if (driver) {
                try { 
                    var index = driverList.findIndex(d => d.driver === driver)
                    if (index !== -1) driverList.splice(index, 1)
                    await driver.quit() 
                } catch (e) {}
            }
            await executeDirectVisit(config)
            return
        }
        
        // Ziyaret kaydını yap
        recordVisit()
        
        // Ziyaret bitince driver'ı kapat
        if (driver) {
            await delay(2000) // Son işlemler için kısa bekleme
            try {
                // Listeden çıkar
                var index = driverList.findIndex(d => d.driver === driver)
                if (index !== -1) driverList.splice(index, 1)
                
                await driver.quit()
                log(`Arama ziyareti driver'ı kapatıldı`)
            } catch (e) {
                log(`Arama driver kapatma hatası: ${e.message}`)
            }
        }
    } catch (err) {
        log(`Arama ziyareti genel hatası: ${err.message}`)
        if (driver) {
            try { await driver.quit() } catch (e) {}
        }
    }
}

// Direkt ziyaret
async function executeDirectVisit(config) {
    var proxy = null
    var proxylist = await loadproxy()
    var useProxy = false
    
    // Proxy kullanımı - proxy listesi varsa kullan
    if (proxylist.length > 0) {
        // Proxy listesi varsa mutlaka kullan
        proxy = proxylist[random(0, proxylist.length - 1)]
        useProxy = true
        logI18n('logMessages.directProxyUsing', {proxy: proxy})
    } else {
        logI18n('logMessages.directProxyNotFound')
    }
    
    var totalTimeMinutes = random(config.totalMinTime, config.totalMaxTime)
    var totalTimeMs = totalTimeMinutes * 60 * 1000
    var startTime = Date.now()
    var pageCount = config.pageCount || 10
    
    // Sitemap kontrolü
    var baseUrlObj = new URL(config.url)
    var baseUrl = baseUrlObj.origin
    var sitemapUrl = await getSitemapUrl(baseUrl)
    var sitemapUrls = []
    
    if (sitemapUrl) {
        sitemapUrls = await parseSitemap(sitemapUrl)
        if (sitemapUrls.length > 0) {
            pageCount = Math.min(pageCount, sitemapUrls.length)
            log(`${sitemapUrls.length} sayfa bulundu, ${pageCount} sayfa gezilecek`)
        }
    }
    
    var options = new chrome.Options()
    // Proxy sadece seçilmişse kullan
    if (useProxy && proxy) {
        try {
            var normalizedProxy = normalizeProxy(proxy)
            if (normalizedProxy) {
                options.addArguments(`--proxy-server=${normalizedProxy}`)
                log(`Proxy kullanılıyor: ${normalizedProxy}`)
            } else {
                log(`Proxy desteklenmiyor veya geçersiz: ${proxy}, proxy olmadan devam ediliyor`)
                useProxy = false
            }
        } catch (e) {
            log(`Proxy ayarlama hatası: ${e.message}, proxy olmadan devam ediliyor`)
            useProxy = false
        }
    }
    PERMISSIONS.forEach(perms => options.addArguments(perms))
    options.excludeSwitches('enable-logging')
    addHeadlessIfEnabled(options)
    
    var driver = null
    try {
        driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
        await Stealth(driver)
    } catch (e) {
        // Proxy hatası varsa proxy olmadan tekrar dene
        if (useProxy && e.message.includes('proxy')) {
            log(`Proxy hatası, proxy olmadan tekrar deneniyor...`)
            options = new chrome.Options()
            PERMISSIONS.forEach(perms => options.addArguments(perms))
            options.excludeSwitches('enable-logging')
            addHeadlessIfEnabled(options)
            driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
            await Stealth(driver)
        } else {
            throw e
        }
    }
    
    // Driver'ı listeye ekle (stop butonu için)
    driverList.push({driver: driver, time: Date.now()})
    
    try {
        if (sitemapUrls.length > 0) {
            // Sitemap'ten sayfaları gez
            var shuffledUrls = [...sitemapUrls].sort(() => Math.random() - 0.5).slice(0, pageCount)
            for (var i = 0; i < shuffledUrls.length; i++) {
                if (Date.now() - startTime >= totalTimeMs) break
                
                await driver.get(shuffledUrls[i])
                await delay(random(2000, 4000))
                await driver.executeScript(auto.scroll())
                
                var pageWaitTime = getRandomTime(config.pageMinTime, config.pageMaxTime)
                var remainingTime = totalTimeMs - (Date.now() - startTime)
                pageWaitTime = Math.min(pageWaitTime, remainingTime)
                
                if (pageWaitTime > 0) {
                    await delay(pageWaitTime)
                }
            }
        } else {
            // Normal gezinti
            await driver.get(config.url)
            await delay(2000)
            await browsePages(driver, baseUrl, config.pageMinTime, config.pageMaxTime)
        }
        
        log(`Ziyaret tamamlandı - Toplam süre: ${Math.floor((Date.now() - startTime) / 1000)} saniye`)
        
        // Ziyaret kaydını yap
        recordVisit()
        
        // Ziyaret bitince driver'ı kapat
        await delay(2000) // Son işlemler için kısa bekleme
        try {
            // Listeden çıkar
            var index = driverList.findIndex(d => d.driver === driver)
            if (index !== -1) driverList.splice(index, 1)
            
            await driver.quit()
            log(`Direkt ziyaret driver'ı kapatıldı`)
        } catch (e) {
            log(`Driver kapatma hatası: ${e.message}`)
        }
    } catch (err) {
        log(`Ziyaret hatası: ${err.message}`)
        if (driver) {
            try {
                var index = driverList.findIndex(d => d.driver === driver)
                if (index !== -1) driverList.splice(index, 1)
                await driver.quit()
            } catch (e) {}
        }
    }
}

// Yeni start fonksiyonu
async function start(config) {
    if (isRunning) {
        log("İşlem zaten çalışıyor!")
        return
    }
    
    isRunning = true
    log(`========================================`)
    log(`Yeni işlem başlatılıyor...`)
    log(`Site: ${config.url}`)
    log(`Toplam Ziyaretçi: ${config.visitorCount}`)
    log(`Başlangıç: ${config.startTime}`)
    log(`Bitiş: ${config.endTime}`)
    log(`Dağılım: ${config.distributionType}`)
    log(`Gizli Mod: ${config.headlessMode ? 'Aktif' : 'Kapalı'}`)
    log(`========================================`)
    
    // Global headless mode ayarını güncelle
    globalHeadlessMode = config.headlessMode !== undefined ? config.headlessMode : true
    
    scheduleVisits(config)
    startScheduler()
}

// Proxy test fonksiyonu
async function testProxies() {
    log(`[PROXY TEST] Proxy testi başlatılıyor...`)
    var proxyList = await loadproxy()
    var results = {
        total: 0,
        valid: 0,
        invalid: 0,
        unsupported: 0,
        working: [],
        notWorking: [],
        unsupportedList: []
    }
    
    if (proxyList.length === 0) {
        log(`[PROXY TEST] Proxy dosyası bulunamadı veya boş`)
        return results
    }
    
    results.total = proxyList.length
    log(`[PROXY TEST] ${results.total} proxy test ediliyor...`)
    
    // Desteklenen proxy'leri filtrele
    var validProxies = []
    proxyList.forEach(p => {
        var normalized = normalizeProxy(p)
        if (normalized) {
            validProxies.push(p)
        } else {
            results.unsupported++
            results.unsupportedList.push(p)
        }
    })
    
    log(`[PROXY TEST] ${validProxies.length} desteklenen proxy bulundu, ${results.unsupported} desteklenmeyen (SOCKS4 vb.)`)
    
    // Her proxy'yi test et (ilk 20 proxy'yi test et, çok uzun sürmemesi için)
    var testCount = Math.min(validProxies.length, 20)
    log(`[PROXY TEST] İlk ${testCount} proxy test ediliyor...`)
    
    for (var i = 0; i < testCount; i++) {
        var proxy = validProxies[i]
        var normalizedProxy = normalizeProxy(proxy)
        
        log(`[PROXY TEST] ${i + 1}/${testCount} - Test ediliyor: ${normalizedProxy}`)
        
        var options = new chrome.Options()
        options.addArguments(`--proxy-server=${normalizedProxy}`)
        PERMISSIONS.forEach(perms => options.addArguments(perms))
        options.excludeSwitches('enable-logging')
        options.addArguments('--headless') // Test için headless kullan
        
        var driver = null
        var testResult = false
        
        try {
            // Timeout ile test et
            var timeoutPromise = new Promise((resolve) => {
                setTimeout(() => {
                    if (driver) {
                        driver.quit().catch(() => {}).finally(() => {
                            testResult = false
                            resolve()
                        })
                    } else {
                        testResult = false
                        resolve()
                    }
                }, 15000) // 15 saniye timeout
            })
            
            var testPromise = new Promise(async (resolve) => {
                try {
                    driver = await new webDriver.Builder()
                        .forBrowser('chrome')
                        .setChromeService(chromedriver)
                        .setChromeOptions(options)
                        .build()
                    
                    // Basit bir sayfaya bağlanmayı dene
                    await driver.get('https://www.google.com')
                    await delay(2000) // 2 saniye bekle
                    testResult = true
                    
                    if (driver) {
                        try {
                            await driver.quit()
                        } catch (e) {}
                    }
                    resolve()
                } catch (e) {
                    testResult = false
                    if (driver) {
                        try {
                            await driver.quit()
                        } catch (e2) {}
                    }
                    resolve()
                }
            })
            
            // İlk tamamlanan promise'i bekle
            await Promise.race([testPromise, timeoutPromise])
            
            if (testResult) {
                results.valid++
                results.working.push(proxy)
                log(`[PROXY TEST] ✅ Çalışıyor: ${normalizedProxy}`)
            } else {
                results.invalid++
                results.notWorking.push(proxy)
                log(`[PROXY TEST] ❌ Çalışmıyor: ${normalizedProxy}`)
            }
        } catch (e) {
            results.invalid++
            results.notWorking.push(proxy)
            log(`[PROXY TEST] ❌ Hata: ${normalizedProxy} - ${e.message}`)
        }
        
        // Her test arasında kısa bekleme
        await delay(500)
    }
    
    log(`[PROXY TEST] Test tamamlandı!`)
    log(`[PROXY TEST] Toplam: ${results.total}`)
    log(`[PROXY TEST] Çalışan: ${results.valid}`)
    log(`[PROXY TEST] Çalışmayan: ${results.invalid}`)
    log(`[PROXY TEST] Desteklenmeyen: ${results.unsupported}`)
    
    return results
}

// Arama motoru botlarını tetikle (ping servisleri)
async function pingSearchEngines(url) {
    log(`[PING] Arama motoru botları tetikleniyor... URL: ${url}`)
    var results = {
        url: url,
        timestamp: new Date().toISOString(),
        pings: {},
        errors: []
    }
    
    try {
        var urlObj = new URL(url)
        var baseUrl = urlObj.origin
        
        // 1. Sitemap ping
        try {
            var sitemapUrl = await getSitemapUrl(baseUrl)
            if (sitemapUrl) {
                log(`[PING] Sitemap bulundu: ${sitemapUrl}`)
                
                // Google Sitemap Ping
                try {
                    var googlePingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
                    await fetchUrl(googlePingUrl)
                    results.pings.googleSitemap = { success: true, message: 'Google sitemap ping başarılı' }
                    log(`[PING] ✅ Google sitemap ping başarılı`)
                } catch (e) {
                    results.pings.googleSitemap = { success: false, message: e.message }
                    results.errors.push(`Google sitemap ping: ${e.message}`)
                    log(`[PING] ❌ Google sitemap ping hatası: ${e.message}`)
                }
                
                // Bing Sitemap Ping
                try {
                    var bingPingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
                    await fetchUrl(bingPingUrl)
                    results.pings.bingSitemap = { success: true, message: 'Bing sitemap ping başarılı' }
                    log(`[PING] ✅ Bing sitemap ping başarılı`)
                } catch (e) {
                    results.pings.bingSitemap = { success: false, message: e.message }
                    results.errors.push(`Bing sitemap ping: ${e.message}`)
                    log(`[PING] ❌ Bing sitemap ping hatası: ${e.message}`)
                }
            } else {
                log(`[PING] ⚠️ Sitemap bulunamadı, sadece URL ping yapılıyor`)
            }
        } catch (e) {
            results.errors.push(`Sitemap kontrolü: ${e.message}`)
        }
        
        // 2. URL Ping Servisleri
        // Google URL Ping (artık deprecated ama deneyebiliriz)
        try {
            // Google'ın yeni yöntemi: Google Search Console API kullanılmalı
            // Ama basit ping için alternatif servisler kullanabiliriz
            log(`[PING] URL ping servisleri deneniyor...`)
        } catch (e) {
            results.errors.push(`URL ping: ${e.message}`)
        }
        
        // 3. RSS Ping (eğer RSS feed varsa)
        try {
            var rssUrl = baseUrl + '/feed'
            var rssExists = await checkUrlExists(rssUrl)
            if (rssExists) {
                log(`[PING] RSS feed bulundu: ${rssUrl}`)
                // RSS ping servisleri
                var rssPingServices = [
                    'https://rpc.weblogs.com/ping',
                    'https://ping.blogs.yandex.ru/ping'
                ]
                
                for (var i = 0; i < rssPingServices.length; i++) {
                    try {
                        // RSS ping formatı genelde POST gerektirir, basit versiyon için atlayalım
                        log(`[PING] RSS ping servisi mevcut: ${rssPingServices[i]}`)
                    } catch (e) {
                        // RSS ping opsiyonel, hata önemli değil
                    }
                }
            }
        } catch (e) {
            // RSS ping opsiyonel
        }
        
        // 4. Social Media Ping (botlar bunları takip eder)
        // Twitter, Facebook gibi platformlar botları tetikler
        log(`[PING] Social media ping önerisi: URL'yi sosyal medyada paylaşmak botları tetikler`)
        
        var successCount = Object.values(results.pings).filter(p => p.success).length
        var totalCount = Object.keys(results.pings).length
        
        log(`[PING] Ping tamamlandı! Başarılı: ${successCount}/${totalCount}`)
        
        return results
        
    } catch (err) {
        log(`[PING] Genel hata: ${err.message}`)
        results.errors.push(`Genel hata: ${err.message}`)
        return results
    }
}

// URL'nin var olup olmadığını kontrol et
async function checkUrlExists(url) {
    return new Promise((resolve) => {
        try {
            var urlObj = new URL(url)
            var client = urlObj.protocol === 'https:' ? https : http
            
            var req = client.get(url, { timeout: 5000 }, (res) => {
                resolve(res.statusCode === 200)
                res.destroy()
            })
            
            req.on('error', () => resolve(false))
            req.on('timeout', () => {
                req.destroy()
                resolve(false)
            })
            
            req.setTimeout(5000)
        } catch (e) {
            resolve(false)
        }
    })
}

// SEO Önerileri oluştur (Akıllı öneri sistemi)
function generateSEORecommendations(analysis) {
    var recommendations = []
    var priority = 'high' // high, medium, low
    
    // 1. Meta Tags Önerileri
    var meta = analysis.checks.metaTags || {}
    if (!meta.title || meta.titleLength === 0) {
        recommendations.push({
            category: 'Meta Tags',
            priority: 'high',
            issue: 'Title tag eksik',
            recommendation: 'Sayfanıza bir <title> tag\'i ekleyin. Title 30-60 karakter arasında olmalı ve anahtar kelimelerinizi içermelidir.',
            example: '<title>Anahtar Kelime - Şirket Adı</title>',
            impact: 'Yüksek - Google arama sonuçlarında görünecek'
        })
    } else if (!meta.titleGood) {
        if (meta.titleLength < 30) {
            recommendations.push({
                category: 'Meta Tags',
                priority: 'high',
                issue: 'Title çok kısa',
                recommendation: `Title'ınız ${meta.titleLength} karakter. En az 30 karakter olmalı. Title'ı genişletin ve anahtar kelimeler ekleyin.`,
                example: `Mevcut: "${meta.title}" → Önerilen: "${meta.title} - Daha Fazla Bilgi"`,
                impact: 'Yüksek - Arama sonuçlarında daha iyi görünür'
            })
        } else if (meta.titleLength > 60) {
            recommendations.push({
                category: 'Meta Tags',
                priority: 'medium',
                issue: 'Title çok uzun',
                recommendation: `Title'ınız ${meta.titleLength} karakter. Google genelde ilk 60 karakteri gösterir. Title'ı kısaltın.`,
                example: `Mevcut: "${meta.title}" → Önerilen: "${meta.title.substring(0, 57)}..."`,
                impact: 'Orta - Google title\'ı kesebilir'
            })
        }
    }
    
    if (!meta.description || meta.descriptionLength === 0) {
        recommendations.push({
            category: 'Meta Tags',
            priority: 'high',
            issue: 'Meta description eksik',
            recommendation: 'Sayfanıza bir meta description ekleyin. 120-160 karakter arasında olmalı ve sayfanın içeriğini özetlemelidir.',
            example: '<meta name="description" content="Sayfanızın kısa ve öz açıklaması buraya gelecek. Anahtar kelimelerinizi içermelidir.">',
            impact: 'Yüksek - Arama sonuçlarında snippet olarak görünür'
        })
    } else if (!meta.descriptionGood) {
        if (meta.descriptionLength < 120) {
            recommendations.push({
                category: 'Meta Tags',
                priority: 'high',
                issue: 'Meta description çok kısa',
                recommendation: `Description'ınız ${meta.descriptionLength} karakter. En az 120 karakter olmalı. Daha detaylı bir açıklama ekleyin.`,
                example: `Mevcut: "${meta.description}" → Önerilen: "${meta.description} - Daha fazla bilgi ve detaylar buraya eklenebilir."`,
                impact: 'Yüksek - Daha iyi snippet oluşturur'
            })
        } else if (meta.descriptionLength > 160) {
            recommendations.push({
                category: 'Meta Tags',
                priority: 'medium',
                issue: 'Meta description çok uzun',
                recommendation: `Description'ınız ${meta.descriptionLength} karakter. Google genelde ilk 160 karakteri gösterir. Kısaltın.`,
                example: `Mevcut: "${meta.description}" → Önerilen: "${meta.description.substring(0, 157)}..."`,
                impact: 'Orta - Google description\'ı kesebilir'
            })
        }
    }
    
    if (!meta.ogTitle || !meta.ogImage) {
        recommendations.push({
            category: 'Social Media',
            priority: 'medium',
            issue: 'Open Graph tags eksik',
            recommendation: 'Sosyal medyada paylaşıldığında daha iyi görünmesi için Open Graph tags ekleyin.',
            example: '<meta property="og:title" content="Başlık">\n<meta property="og:description" content="Açıklama">\n<meta property="og:image" content="https://example.com/image.jpg">',
            impact: 'Orta - Sosyal medya paylaşımlarında daha iyi görünüm'
        })
    }
    
    // 2. Heading Tags Önerileri
    var headings = analysis.checks.headings || {}
    if (headings.h1Count === 0) {
        recommendations.push({
            category: 'Content Structure',
            priority: 'high',
            issue: 'H1 tag eksik',
            recommendation: 'Sayfanıza mutlaka bir H1 tag\'i ekleyin. H1, sayfanın ana başlığı olmalı ve anahtar kelimelerinizi içermelidir.',
            example: '<h1>Ana Başlık - Anahtar Kelime</h1>',
            impact: 'Yüksek - SEO için kritik öneme sahip'
        })
    } else if (headings.h1Count > 1) {
        recommendations.push({
            category: 'Content Structure',
            priority: 'high',
            issue: 'Birden fazla H1 tag var',
            recommendation: `Sayfanızda ${headings.h1Count} adet H1 tag var. SEO için sadece 1 H1 olmalı. Fazla H1'leri H2 veya H3'e çevirin.`,
            example: 'İkinci H1\'i H2\'ye çevirin: <h2>İkinci Başlık</h2>',
            impact: 'Yüksek - Google için karışıklık yaratır'
        })
    }
    
    if (headings.h2Count === 0 && headings.h3Count === 0) {
        recommendations.push({
            category: 'Content Structure',
            priority: 'medium',
            issue: 'Alt başlıklar eksik',
            recommendation: 'İçeriğinizi organize etmek için H2 ve H3 başlıkları ekleyin. Bu hem SEO hem de kullanıcı deneyimi için önemlidir.',
            example: '<h2>Alt Başlık 1</h2>\n<p>İçerik...</p>\n<h3>Alt Alt Başlık</h3>',
            impact: 'Orta - İçerik yapısını iyileştirir'
        })
    }
    
    // 3. Images Önerileri
    var images = analysis.checks.images || {}
    if (images.total > 0 && images.altPercentage < 80) {
        recommendations.push({
            category: 'Images',
            priority: 'high',
            issue: `${images.withoutAlt} resim alt tag'siz`,
            recommendation: `Sayfanızda ${images.withoutAlt} resim alt tag'i olmadan. Tüm resimlere açıklayıcı alt tag'leri ekleyin.`,
            example: '<img src="image.jpg" alt="Açıklayıcı resim açıklaması">',
            impact: 'Yüksek - Erişilebilirlik ve SEO için önemli'
        })
    }
    
    // 4. Content Önerileri
    var content = analysis.checks.content || {}
    if (!content.wordCountGood) {
        recommendations.push({
            category: 'Content',
            priority: 'high',
            issue: 'İçerik çok kısa',
            recommendation: `Sayfanızda sadece ${content.wordCount} kelime var. SEO için en az 300 kelime önerilir. Daha fazla içerik ekleyin.`,
            example: 'İlgili konularda detaylı açıklamalar, örnekler ve bilgiler ekleyin.',
            impact: 'Yüksek - Google içerik kalitesini değerlendirir'
        })
    }
    
    // 5. Technical SEO Önerileri
    if (!analysis.checks.ssl?.secure) {
        recommendations.push({
            category: 'Security',
            priority: 'high',
            issue: 'HTTPS kullanılmıyor',
            recommendation: 'Siteniz HTTP kullanıyor. HTTPS\'e geçiş yapın. Google HTTPS kullanan sitelere öncelik verir.',
            example: 'SSL sertifikası alın ve sitenizi HTTPS\'e yönlendirin.',
            impact: 'Yüksek - Güvenlik ve SEO için kritik'
        })
    }
    
    if (!analysis.checks.mobile?.hasViewport) {
        recommendations.push({
            category: 'Mobile',
            priority: 'high',
            issue: 'Mobile-friendly değil',
            recommendation: 'Sayfanızda viewport meta tag\'i yok. Mobil cihazlarda düzgün görünmesi için ekleyin.',
            example: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
            impact: 'Yüksek - Mobil SEO için gerekli'
        })
    }
    
    if (!analysis.checks.schema?.hasSchema) {
        recommendations.push({
            category: 'Structured Data',
            priority: 'medium',
            issue: 'Schema markup yok',
            recommendation: 'Google\'ın içeriğinizi daha iyi anlaması için Schema.org structured data ekleyin.',
            example: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"...}</script>',
            impact: 'Orta - Rich snippets için fırsat'
        })
    }
    
    if (analysis.loadTime >= 3000) {
        recommendations.push({
            category: 'Performance',
            priority: 'medium',
            issue: 'Sayfa yükleme süresi yavaş',
            recommendation: `Sayfanız ${Math.round(analysis.loadTime / 1000)} saniyede yükleniyor. 3 saniyenin altına indirmeye çalışın.`,
            example: 'Resimleri optimize edin, CSS/JS dosyalarını küçültün, CDN kullanın.',
            impact: 'Orta - Kullanıcı deneyimi ve SEO için önemli'
        })
    }
    
    if (!analysis.checks.sitemap?.found) {
        recommendations.push({
            category: 'SEO Files',
            priority: 'medium',
            issue: 'Sitemap bulunamadı',
            recommendation: 'Google\'ın sitenizi daha iyi indexlemesi için sitemap.xml dosyası oluşturun.',
            example: 'Sitemap oluşturucu araçlar kullanın veya CMS\'iniz otomatik oluşturuyor mu kontrol edin.',
            impact: 'Orta - Indexleme için yardımcı'
        })
    }
    
    if (!analysis.checks.robotsTxt?.found) {
        recommendations.push({
            category: 'SEO Files',
            priority: 'low',
            issue: 'Robots.txt yok',
            recommendation: 'Arama motoru botlarını yönlendirmek için robots.txt dosyası oluşturun (opsiyonel).',
            example: 'User-agent: *\nAllow: /',
            impact: 'Düşük - Opsiyonel ama önerilir'
        })
    }
    
    // Öncelik sırasına göre sırala
    var priorityOrder = { 'high': 1, 'medium': 2, 'low': 3 }
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    
    return recommendations
}

// URL fetch helper
async function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        try {
            var urlObj = new URL(url)
            var client = urlObj.protocol === 'https:' ? https : http
            
            var req = client.get(url, { timeout: 10000 }, (res) => {
                var data = ''
                res.on('data', (chunk) => { data += chunk })
                res.on('end', () => {
                    resolve(data)
                })
            })
            
            req.on('error', (err) => reject(err))
            req.on('timeout', () => {
                req.destroy()
                reject(new Error('Timeout'))
            })
            
            req.setTimeout(10000)
        } catch (e) {
            reject(e)
        }
    })
}

// SEO Analizi yap
async function analyzeSEO(url) {
    log(`[SEO ANALİZ] SEO analizi başlatılıyor... URL: ${url}`)
    var options = new chrome.Options()
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    options.addArguments('--headless') // Analiz için headless
    
    var driver = null
    var analysis = {
        url: url,
        timestamp: new Date().toISOString(),
        score: 0,
        maxScore: 100,
        checks: {},
        errors: []
    }
    
    try {
        var startTime = Date.now()
        driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
        await Stealth(driver)
        
        await driver.get(url)
        await delay(5000) // Sayfanın yüklenmesini bekle
        
        var loadTime = Date.now() - startTime
        analysis.loadTime = loadTime
        
        // Sayfa HTML'ini al
        var pageSource = await driver.getPageSource()
        var pageTitle = await driver.getTitle()
        
        // 1. Meta Tags Kontrolü
        log(`[SEO ANALİZ] Meta tags kontrol ediliyor...`)
        var metaTitle = await driver.executeScript(`
            var title = document.querySelector('title');
            return title ? title.textContent.trim() : '';
        `)
        var metaDescription = await driver.executeScript(`
            var desc = document.querySelector('meta[name="description"]');
            return desc ? desc.getAttribute('content') : '';
        `)
        var metaKeywords = await driver.executeScript(`
            var keywords = document.querySelector('meta[name="keywords"]');
            return keywords ? keywords.getAttribute('content') : '';
        `)
        var ogTitle = await driver.executeScript(`
            var og = document.querySelector('meta[property="og:title"]');
            return og ? og.getAttribute('content') : '';
        `)
        var ogDescription = await driver.executeScript(`
            var og = document.querySelector('meta[property="og:description"]');
            return og ? og.getAttribute('content') : '';
        `)
        var ogImage = await driver.executeScript(`
            var og = document.querySelector('meta[property="og:image"]');
            return og ? og.getAttribute('content') : '';
        `)
        var twitterCard = await driver.executeScript(`
            var tw = document.querySelector('meta[name="twitter:card"]');
            return tw ? tw.getAttribute('content') : '';
        `)
        
        analysis.checks.metaTags = {
            title: metaTitle || pageTitle,
            titleLength: (metaTitle || pageTitle).length,
            titleGood: (metaTitle || pageTitle).length >= 30 && (metaTitle || pageTitle).length <= 60,
            description: metaDescription,
            descriptionLength: metaDescription ? metaDescription.length : 0,
            descriptionGood: metaDescription ? (metaDescription.length >= 120 && metaDescription.length <= 160) : false,
            keywords: metaKeywords,
            ogTitle: ogTitle,
            ogDescription: ogDescription,
            ogImage: ogImage,
            twitterCard: twitterCard
        }
        
        // 2. Heading Tags
        log(`[SEO ANALİZ] Heading tags kontrol ediliyor...`)
        var headings = await driver.executeScript(`
            var h1 = document.querySelectorAll('h1');
            var h2 = document.querySelectorAll('h2');
            var h3 = document.querySelectorAll('h3');
            return {
                h1: Array.from(h1).map(h => h.textContent.trim()),
                h2: Array.from(h2).map(h => h.textContent.trim()),
                h3: Array.from(h3).map(h => h.textContent.trim())
            };
        `)
        
        analysis.checks.headings = {
            h1: headings.h1,
            h1Count: headings.h1.length,
            h1Good: headings.h1.length === 1,
            h2: headings.h2,
            h2Count: headings.h2.length,
            h3: headings.h3,
            h3Count: headings.h3.length
        }
        
        // 3. Images Alt Tags
        log(`[SEO ANALİZ] Image alt tags kontrol ediliyor...`)
        var images = await driver.executeScript(`
            var imgs = document.querySelectorAll('img');
            var result = [];
            for (var i = 0; i < imgs.length; i++) {
                var img = imgs[i];
                result.push({
                    src: img.src || '',
                    alt: img.alt || '',
                    hasAlt: !!img.alt
                });
            }
            return result;
        `)
        
        var imagesWithAlt = images.filter(img => img.hasAlt).length
        var imagesWithoutAlt = images.length - imagesWithAlt
        
        analysis.checks.images = {
            total: images.length,
            withAlt: imagesWithAlt,
            withoutAlt: imagesWithoutAlt,
            altPercentage: images.length > 0 ? Math.round((imagesWithAlt / images.length) * 100) : 100
        }
        
        // 4. Links
        log(`[SEO ANALİZ] Links kontrol ediliyor...`)
        var links = await driver.executeScript(`
            var links = document.querySelectorAll('a[href]');
            var internal = 0, external = 0, nofollow = 0;
            var baseUrl = window.location.origin;
            for (var i = 0; i < links.length; i++) {
                var href = links[i].href;
                var rel = links[i].rel || '';
                if (rel.includes('nofollow')) nofollow++;
                if (href.startsWith(baseUrl) || href.startsWith('/')) {
                    internal++;
                } else if (href.startsWith('http')) {
                    external++;
                }
            }
            return { total: links.length, internal: internal, external: external, nofollow: nofollow };
        `)
        
        analysis.checks.links = links
        
        // 5. Content Analysis
        log(`[SEO ANALİZ] İçerik analizi yapılıyor...`)
        var content = await driver.executeScript(`
            var body = document.body;
            return body ? body.innerText.trim() : '';
        `)
        
        var wordCount = content.split(/\s+/).filter(w => w.length > 0).length
        var charCount = content.length
        
        analysis.checks.content = {
            wordCount: wordCount,
            charCount: charCount,
            wordCountGood: wordCount >= 300,
            hasContent: wordCount > 0
        }
        
        // 6. Mobile-Friendly
        log(`[SEO ANALİZ] Mobile-friendly kontrol ediliyor...`)
        var viewport = await driver.executeScript(`
            var viewport = document.querySelector('meta[name="viewport"]');
            return viewport ? viewport.getAttribute('content') : '';
        `)
        
        analysis.checks.mobile = {
            hasViewport: !!viewport,
            viewportContent: viewport
        }
        
        // 7. SSL/HTTPS
        var isHTTPS = url.startsWith('https://')
        analysis.checks.ssl = {
            isHTTPS: isHTTPS,
            secure: isHTTPS
        }
        
        // 8. URL Structure
        var urlObj = new URL(url)
        var urlPath = urlObj.pathname
        var hasGoodUrl = !urlPath.includes('_') && !urlPath.match(/\d{4}\/\d{2}\/\d{2}/) // Tarih formatı yok
        analysis.checks.url = {
            path: urlPath,
            hasGoodStructure: hasGoodUrl,
            length: url.length,
            lengthGood: url.length <= 100
        }
        
        // 9. Schema Markup
        log(`[SEO ANALİZ] Schema markup kontrol ediliyor...`)
        var schema = await driver.executeScript(`
            var scripts = document.querySelectorAll('script[type="application/ld+json"]');
            return scripts.length;
        `)
        
        analysis.checks.schema = {
            hasSchema: schema > 0,
            schemaCount: schema
        }
        
        // 10. Robots Meta
        var robotsMeta = await driver.executeScript(`
            var robots = document.querySelector('meta[name="robots"]');
            return robots ? robots.getAttribute('content') : '';
        `)
        
        analysis.checks.robots = {
            robotsMeta: robotsMeta,
            hasRobotsMeta: !!robotsMeta
        }
        
        // Score Hesapla
        var score = 0
        if (analysis.checks.metaTags.titleGood) score += 10
        if (analysis.checks.metaTags.descriptionGood) score += 10
        if (analysis.checks.headings.h1Good) score += 10
        if (analysis.checks.images.altPercentage >= 80) score += 10
        if (analysis.checks.content.wordCountGood) score += 10
        if (analysis.checks.mobile.hasViewport) score += 10
        if (analysis.checks.ssl.secure) score += 10
        if (analysis.checks.url.hasGoodStructure) score += 5
        if (analysis.checks.url.lengthGood) score += 5
        if (analysis.checks.schema.hasSchema) score += 10
        if (loadTime < 3000) score += 10
        
        analysis.score = score
        
        // Sitemap ve Robots.txt kontrolü
        try {
            var baseUrl = urlObj.origin
            var sitemapUrl = await getSitemapUrl(baseUrl)
            analysis.checks.sitemap = {
                found: !!sitemapUrl,
                url: sitemapUrl
            }
            
            var robotsTxtUrl = baseUrl + '/robots.txt'
            try {
                var robotsContent = await fetchSitemap(robotsTxtUrl)
                analysis.checks.robotsTxt = {
                    found: true,
                    hasContent: robotsContent.length > 0
                }
            } catch (e) {
                analysis.checks.robotsTxt = {
                    found: false
                }
            }
        } catch (e) {
            analysis.errors.push(`Sitemap/Robots kontrolü hatası: ${e.message}`)
        }
        
        log(`[SEO ANALİZ] Analiz tamamlandı! Skor: ${score}/100`)
        
        // SEO Önerileri oluştur
        analysis.recommendations = generateSEORecommendations(analysis)
        
        await driver.quit()
        return analysis
        
    } catch (err) {
        log(`[SEO ANALİZ] Hata: ${err.message}`)
        analysis.errors.push(err.message)
        if (driver) {
            try {
                await driver.quit()
            } catch (e) {}
        }
        return analysis
    }
}

// Google sıralamasını kontrol et (sadece kontrol, ziyaret yapmaz)
async function checkRanking(url, keyword) {
    log(`[RANKING CHECK] Sıralama kontrol ediliyor... URL: ${url}, Keyword: "${keyword}"`)
    var options = new chrome.Options()
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    options.addArguments('--headless') // Sadece kontrol için headless
    
    var driver = null
    try {
        driver = await new webDriver.Builder().forBrowser('chrome').setChromeService(chromedriver).setChromeOptions(options).build()
        await Stealth(driver)
        
        await driver.get("https://www.google.com/")
        await delay(3000)
        
        // Cookie kabul et
        try {
            var acceptSelectors = [
                webDriver.By.css('button[id*="L2AGLb"]'),
                webDriver.By.css('.QS5gu'),
                webDriver.By.css('button[aria-label*="Accept"]')
            ]
            for (var s = 0; s < acceptSelectors.length; s++) {
                try {
                    var accept_cookies = await driver.findElements(acceptSelectors[s])
                    if (accept_cookies.length > 0) {
                        var isDisplayed = await accept_cookies[0].isDisplayed()
                        if (isDisplayed) {
                            await accept_cookies[0].click()
                            await delay(2000)
                            break
                        }
                    }
                } catch (e) {
                    continue
                }
            }
        } catch (e) {}
        
        // Arama yap
        var searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
        await driver.get(searchUrl)
        await delay(3000)
        
        // Sıralamayı bul
        var pageId = await findSiteUrl(driver, url)
        var currentPage = 1
        
        if (pageId == -1) {
            // İkinci sayfaya bak
            pageId = await nextPage(driver, url)
            currentPage = 2
        }
        
        var result = {
            found: pageId !== -1,
            position: pageId !== -1 ? (pageId + 1 + ((currentPage - 1) * 10)) : -1,
            page: currentPage,
            keyword: keyword,
            url: url
        }
        
        if (result.found) {
            log(`[RANKING CHECK] ✅ Bulundu! Pozisyon: ${result.position} (Sayfa ${result.page})`)
        } else {
            log(`[RANKING CHECK] ❌ Bulunamadı (ilk 2 sayfada)`)
        }
        
        await driver.quit()
        return result
        
    } catch (err) {
        log(`[RANKING CHECK] Hata: ${err.message}`)
        if (driver) {
            try {
                await driver.quit()
            } catch (e) {}
        }
        return {
            found: false,
            position: -1,
            page: 1,
            keyword: keyword,
            url: url,
            error: err.message
        }
    }
}

// Proxy listesini otomatik indir
async function downloadProxies(source = 'proxyscrape') {
    log(`[PROXY İNDİR] Proxy listesi indiriliyor... Kaynak: ${source}`)
    
    try {
        var proxyData = ''
        var proxyUrl = ''
        
        // Kaynak seçimi
        switch(source) {
            case 'proxyscrape':
                // Proxyscrape.com - HTTP/HTTPS proxy'ler
                proxyUrl = 'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all'
                break
            case 'proxyscrape_socks5':
                // Proxyscrape.com - SOCKS5 proxy'ler
                proxyUrl = 'https://api.proxyscrape.com/v2/?request=get&protocol=socks5&timeout=10000&country=all'
                break
            case 'proxyscrape_all':
                // Proxyscrape.com - Tüm proxy'ler
                proxyUrl = 'https://api.proxyscrape.com/v2/?request=get&protocol=all&timeout=10000&country=all'
                break
            default:
                proxyUrl = 'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all'
        }
        
        // Proxy listesini indir
        proxyData = await new Promise((resolve, reject) => {
            https.get(proxyUrl, (res) => {
                var data = ''
                res.on('data', (chunk) => {
                    data += chunk
                })
                res.on('end', () => {
                    resolve(data)
                })
            }).on('error', (err) => {
                reject(err)
            })
        })
        
        if (!proxyData || proxyData.trim().length === 0) {
            throw new Error('Proxy listesi boş döndü')
        }
        
        // Proxy'leri parse et
        var proxies = proxyData.split('\n').map(p => p.trim()).filter(p => p.length > 0)
        
        if (proxies.length === 0) {
            throw new Error('Geçerli proxy bulunamadı')
        }
        
        log(`[PROXY İNDİR] ${proxies.length} proxy indirildi`)
        
        // Dosyaya kaydet
        var proxyDir = './proxy'
        if (!fs.existsSync(proxyDir)) {
            fs.mkdirSync(proxyDir, { recursive: true })
        }
        
        // Tarih damgalı dosya adı
        var now = new Date()
        var dateStr = now.getFullYear() + '_' + 
                     String(now.getMonth() + 1).padStart(2, '0') + '_' + 
                     String(now.getDate()).padStart(2, '0')
        var fileName = `${dateStr}_proxyscrape_${source}.txt`
        var filePath = path.join(proxyDir, fileName)
        
        // Proxy'leri dosyaya yaz
        var fileContent = proxies.join('\n')
        fs.writeFileSync(filePath, fileContent, 'utf8')
        
        log(`[PROXY İNDİR] ✅ Proxy listesi kaydedildi: ${fileName} (${proxies.length} proxy)`)
        
        return {
            success: true,
            count: proxies.length,
            fileName: fileName,
            filePath: filePath,
            source: source
        }
        
    } catch (err) {
        log(`[PROXY İNDİR] ❌ Hata: ${err.message}`)
        return {
            success: false,
            error: err.message,
            count: 0
        }
    }
}

module.exports = { 
    main: main,
    stop: stop,
    setLogCallback: setLogCallback,
    setVisitCallback: setVisitCallback,
    setRankingCallback: setRankingCallback,
    checkSitemap: checkSitemap,
    start: start,
    testProxies: testProxies,
    checkRanking: checkRanking,
    analyzeSEO: analyzeSEO,
    pingSearchEngines: pingSearchEngines,
    downloadProxies: downloadProxies
}