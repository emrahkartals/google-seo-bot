const webDriver = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const chromedriver = new chrome.ServiceBuilder(require('chromedriver').path)
const https = require('https')
const http = require('http')

const auto = require('./autobot')
const loadproxy = require('./proxy')
const spoofing = require('./spoofing')

var logCallback = null
var visitCallback = null
var isRunning = false
var scheduledVisits = []
var visitInterval = null

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

const PERMISSIONS = [
    // "--headless", // Kaldırıldı - pencereler görünür olacak
    "--mute-audio",
    "--disable-logging",
    "--disable-infobars",
    "--disable-dev-shm-usage",
]


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
    if (proxy)
        options.addArguments(`--proxy-server=http://${proxy}`)
    PERMISSIONS.forEach(perms => {
        options.addArguments(perms)
    })
    options.excludeSwitches('enable-logging')
    log(`[COUNT ${countIndex}] [DIRECT] Başlatılıyor... URL: ${url}${proxy ? ' | Proxy: ' + proxy : ''}`)
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
        await delay(2000)
        
        // Eğer ilk sayfada bulunamadıysa, birkaç sayfa daha dene
        if (pageId == -1) {
            logI18n('logMessages.googleNotFoundFirstPage')
            pageId = await nextPage(driver, url)
        }
        
        // Eğer hala bulunamadıysa, direkt siteye git (ama Google'da arama yapılmış oldu - SEO için önemli)
        if (pageId == -1) {
            logI18n('logMessages.googleNotFound')
            logI18n('logMessages.googleNote')
            await driver.get(url)
            await delay(2000)
        } else {
            // Site bulundu, tıkla
            logI18n('logMessages.googleFound', {position: pageId + 1})
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
    if (proxy.length > 0) {
        logI18n('logMessages.proxyListLoaded', {count: proxy.length})
    } else {
        logI18n('logMessages.proxyListNotFound')
    }
    if (option == "Direct"){
        logI18n('logMessages.directStarting', {url: url})
        while (usedDriver != count && usedDriver < count){
            await Direct(url, proxy.length > 0 ? proxy[usedDriver] : null, minTime, maxTime, useSitemap, usedDriver + 1)
            usedDriver += 1
        }
        logI18n('logMessages.directCompleted')
    }else if (option == "Google"){
        logI18n('logMessages.googleSearchStarting', {url: url, keyword: keyboard})
        while (usedDriver != count && usedDriver < count){
            await googleSearch(url, keyboard, proxy.length > 0 ? proxy[usedDriver] : null, minTime, maxTime)
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
    
    // Proxy kullanımını opsiyonel yap - proxy sorunları varsa kullanma
    if (proxylist.length > 0) {
        // %30 ihtimalle proxy kullan (proxy sorunlarını azaltmak için)
        if (Math.random() < 0.3) {
            proxy = proxylist[random(0, proxylist.length - 1)]
            useProxy = true
            log(`Proxy kullanılıyor: ${proxy}`)
        } else {
            log(`Proxy kullanılmıyor (rastgele seçim)`)
        }
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
            options.addArguments(`--proxy-server=http://${proxy}`)
        } catch (e) {
            log(`Proxy ayarlama hatası: ${e.message}, proxy olmadan devam ediliyor`)
            useProxy = false
        }
    }
    PERMISSIONS.forEach(perms => options.addArguments(perms))
    options.excludeSwitches('enable-logging')
    
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
    log(`========================================`)
    
    scheduleVisits(config)
    startScheduler()
}

module.exports = { 
    main: main,
    stop: stop,
    setLogCallback: setLogCallback,
    setVisitCallback: setVisitCallback,
    checkSitemap: checkSitemap,
    start: start
}