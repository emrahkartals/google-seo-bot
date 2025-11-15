// DOM Elements
const urlInput = document.getElementById('url');
const visitorCountInput = document.getElementById('visitor-count');
const distributionTypeSelect = document.getElementById('distribution-type');
const newVisitorRateInput = document.getElementById('new-visitor-rate');
const searchKeywordsTextarea = document.getElementById('search-keywords');
const searchEngineSelect = document.getElementById('search-engine');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const pageMinTimeInput = document.getElementById('page-min-time');
const pageMaxTimeInput = document.getElementById('page-max-time');
const totalMinTimeInput = document.getElementById('total-min-time');
const totalMaxTimeInput = document.getElementById('total-max-time');
const pageCountInput = document.getElementById('page-count');

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const checkSitemapBtn = document.getElementById('check-sitemap-btn');
const testProxyBtn = document.getElementById('test-proxy-btn');
const downloadProxyBtn = document.getElementById('download-proxy-btn');
const analyzeSeoBtn = document.getElementById('analyze-seo-btn');
const pingBotsBtn = document.getElementById('ping-bots-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const seoModal = document.getElementById('seo-modal');
const seoModalClose = document.getElementById('seo-modal-close');
const seoLoading = document.getElementById('seo-loading');
const seoResults = document.getElementById('seo-results');
const apiSettingsModal = document.getElementById('api-settings-modal');
const apiSettingsModalClose = document.getElementById('api-settings-modal-close');
const openaiApiKeyInput = document.getElementById('openai-api-key');
const anthropicApiKeyInput = document.getElementById('anthropic-api-key');
const googleApiKeyInput = document.getElementById('google-api-key');
const saveApiKeysBtn = document.getElementById('save-api-keys-btn');
const clearApiKeysBtn = document.getElementById('clear-api-keys-btn');
const cancelApiSettingsBtn = document.getElementById('cancel-api-settings-btn');
const toggleOpenaiVisibility = document.getElementById('toggle-openai-visibility');
const toggleAnthropicVisibility = document.getElementById('toggle-anthropic-visibility');
const toggleGoogleVisibility = document.getElementById('toggle-google-visibility');
const chartTypeBtn = document.getElementById('chart-type-btn');
const resetChartBtn = document.getElementById('reset-chart-btn');

const logsContainer = document.getElementById('logs-container');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const totalVisitsSpan = document.getElementById('total-visits');
const lastVisitSpan = document.getElementById('last-visit');
const chartCanvas = document.getElementById('visits-chart');

// State
let totalVisits = 0;
let isRunning = false;
let visitsChart = null;
let chartType = 'line'; // 'line' or 'bar'
let visitData = {
    labels: [],
    data: []
};

// i18n
let currentLanguage = localStorage.getItem('language') || 'tr';
let translations = {};

// Footer Protection - Original content
const FOOTER_ORIGINAL_HTML = `
    <div class="footer-content">
        <p class="footer-text">
            © 2024 <span class="footer-author" id="footer-author">emrahkartals</span> - All Rights Reserved
        </p>
        <p class="footer-license">Proprietary Software - Unauthorized copying prohibited</p>
    </div>
`;

// Footer Protection Mechanism
function protectFooter() {
    const footer = document.getElementById('app-footer');
    if (!footer) return;
    
    // Store original content
    const originalAuthor = 'emrahkartals';
    
    // Monitor for changes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const authorElement = document.getElementById('footer-author');
                if (authorElement && authorElement.textContent !== originalAuthor) {
                    authorElement.textContent = originalAuthor;
                }
                
                // Check if footer was removed
                if (!document.getElementById('app-footer')) {
                    const body = document.body;
                    const newFooter = document.createElement('footer');
                    newFooter.id = 'app-footer';
                    newFooter.className = 'app-footer';
                    newFooter.innerHTML = FOOTER_ORIGINAL_HTML;
                    body.appendChild(newFooter);
                    protectFooter(); // Re-protect the new footer
                }
                
                // Check if footer content was modified
                if (footer.innerHTML !== FOOTER_ORIGINAL_HTML.trim()) {
                    footer.innerHTML = FOOTER_ORIGINAL_HTML;
                }
            }
        });
    });
    
    // Observe footer for changes
    observer.observe(footer, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: false
    });
    
    // Prevent right-click context menu on footer
    footer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
    
    // Prevent text selection
    footer.addEventListener('selectstart', (e) => {
        e.preventDefault();
        return false;
    });
    
    // Prevent drag
    footer.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
    });
    
    // Periodic check to restore footer if removed
    setInterval(() => {
        if (!document.getElementById('app-footer')) {
            const body = document.body;
            const newFooter = document.createElement('footer');
            newFooter.id = 'app-footer';
            newFooter.className = 'app-footer';
            newFooter.innerHTML = FOOTER_ORIGINAL_HTML;
            body.appendChild(newFooter);
            protectFooter(); // Re-protect the new footer
        } else {
            const authorElement = document.getElementById('footer-author');
            if (authorElement && authorElement.textContent !== originalAuthor) {
                authorElement.textContent = originalAuthor;
            }
        }
    }, 1000);
}

// Theme Management
let isDarkTheme = localStorage.getItem('darkTheme') === 'true';

function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    
    if (isDarkTheme) {
        document.body.classList.add('dark-theme');
        themeIcon.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-theme');
        themeIcon.textContent = '🌙';
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            isDarkTheme = !isDarkTheme;
            localStorage.setItem('darkTheme', isDarkTheme);
            
            if (isDarkTheme) {
                document.body.classList.add('dark-theme');
                themeIcon.textContent = '☀️';
            } else {
                document.body.classList.remove('dark-theme');
                themeIcon.textContent = '🌙';
            }
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme
    initTheme();
    
    // Load translations
    await loadTranslations(currentLanguage);
    applyTranslations();
    
    // Protect footer
    protectFooter();
    
    // Set language selector
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        languageSelect.value = currentLanguage;
        languageSelect.addEventListener('change', async (e) => {
            currentLanguage = e.target.value;
            localStorage.setItem('language', currentLanguage);
            await loadTranslations(currentLanguage);
            applyTranslations();
            updateChartLabel();
        });
    }
    
    // Set default times
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    
    startTimeInput.value = formatDateTimeLocal(now);
    endTimeInput.value = formatDateTimeLocal(oneHourLater);
    
    // Event listeners
    startBtn.addEventListener('click', handleStart);
    stopBtn.addEventListener('click', handleStop);
    checkSitemapBtn.addEventListener('click', handleCheckSitemap);
    testProxyBtn.addEventListener('click', handleTestProxy);
    downloadProxyBtn.addEventListener('click', handleDownloadProxy);
    analyzeSeoBtn.addEventListener('click', handleAnalyzeSEO);
    pingBotsBtn.addEventListener('click', handlePingBots);
    clearLogsBtn.addEventListener('click', clearLogs);
    
    // SEO Modal close
    seoModalClose.addEventListener('click', () => {
        seoModal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === seoModal) {
            seoModal.style.display = 'none';
        }
        if (e.target === apiSettingsModal) {
            apiSettingsModal.style.display = 'none';
        }
    });
    
    // API Settings Modal
    apiSettingsModalClose.addEventListener('click', () => {
        apiSettingsModal.style.display = 'none';
    });
    
    saveApiKeysBtn.addEventListener('click', handleSaveApiKeys);
    clearApiKeysBtn.addEventListener('click', handleClearApiKeys);
    cancelApiSettingsBtn.addEventListener('click', () => {
        apiSettingsModal.style.display = 'none';
    });
    
    // Toggle visibility buttons
    toggleOpenaiVisibility.addEventListener('click', () => {
        togglePasswordVisibility(openaiApiKeyInput, toggleOpenaiVisibility);
    });
    toggleAnthropicVisibility.addEventListener('click', () => {
        togglePasswordVisibility(anthropicApiKeyInput, toggleAnthropicVisibility);
    });
    toggleGoogleVisibility.addEventListener('click', () => {
        togglePasswordVisibility(googleApiKeyInput, toggleGoogleVisibility);
    });
    chartTypeBtn.addEventListener('click', toggleChartType);
    resetChartBtn.addEventListener('click', resetChart);
    
    // Auto-normalize URL when user leaves the input field
    urlInput.addEventListener('blur', () => {
        const url = urlInput.value.trim();
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            const normalizedUrl = normalizeUrl(url);
            urlInput.value = normalizedUrl;
        }
    });
    
    // Initialize chart
    initChart();
    
    // Electron API listeners
    if (window.electronAPI) {
        // Menü komutlarını dinle
        window.electronAPI.onMenuStartBot(() => {
            handleStart();
        });
        
        window.electronAPI.onMenuStopBot(() => {
            handleStop();
        });
        
        window.electronAPI.onMenuCheckSitemap(() => {
            handleCheckSitemap();
        });
        
        window.electronAPI.onMenuAbout(() => {
            showAboutDialog();
        });
        
        window.electronAPI.onMenuOpenSettings(() => {
            openApiSettings();
        });
        
        window.electronAPI.onLogMessage((message) => {
            addLog(message);
        });
        
        window.electronAPI.onVisitRecorded((visit) => {
            try {
                totalVisits++;
                totalVisitsSpan.textContent = totalVisits;
                const visitTime = new Date(visit.timestamp);
                // Map language codes to locale strings
                const localeMap = {
                    'tr': 'tr-TR',
                    'en': 'en-US',
                    'de': 'de-DE',
                    'fr': 'fr-FR',
                    'ru': 'ru-RU',
                    'ja': 'ja-JP',
                    'ko': 'ko-KR'
                };
                const locale = localeMap[currentLanguage] || 'en-US';
                lastVisitSpan.textContent = visitTime.toLocaleTimeString(locale);
                addLog(t('messages.visitRecorded', {time: visitTime.toLocaleString(locale)}), 'success');
                
                // Update chart
                updateChart(visitTime);
            } catch (error) {
                console.error('Visit callback error:', error);
                addLog(t('messages.visitError', {error: error.message}), 'error');
            }
        });
        
        window.electronAPI.onRankingRecorded((ranking) => {
            try {
                // Sıralama kaydı alındı - log'a ekle
                if (ranking.position > 0) {
                    addLog(`📊 Sıralama: "${ranking.keyword}" - Pozisyon ${ranking.position} (Sayfa ${ranking.page})`, 'success');
                } else {
                    addLog(`📊 Sıralama: "${ranking.keyword}" - Bulunamadı (ilk ${ranking.page} sayfada)`, 'warning');
                }
            } catch (e) {
                console.error('Ranking record error:', e);
            }
        });
        
        // Check bot status periodically
        setInterval(async () => {
            const status = await window.electronAPI.getBotStatus();
            updateStatus(status.isRunning);
        }, 1000);
    }
});

// Load translations
async function loadTranslations(lang) {
    try {
        const response = await fetch(`locales/${lang}.json`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        translations = await response.json();
    } catch (error) {
        console.error('Failed to load translations:', error);
        // Fallback to Turkish if loading fails
        if (lang !== 'tr') {
            try {
                const response = await fetch('locales/tr.json');
                translations = await response.json();
            } catch (fallbackError) {
                console.error('Failed to load fallback translations:', fallbackError);
            }
        }
    }
}

// Get translation
function t(key, params = {}) {
    const keys = key.split('.');
    let value = translations;
    
    for (const k of keys) {
        if (value && typeof value === 'object') {
            value = value[k];
        } else {
            return key; // Return key if translation not found
        }
    }
    
    if (typeof value !== 'string') {
        return key;
    }
    
    // Replace parameters
    Object.keys(params).forEach(param => {
        value = value.replace(`{${param}}`, params[param]);
    });
    
    return value;
}

// Apply translations to DOM
function applyTranslations() {
    // Translate all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = t(key);
        if (translation && translation !== key) {
            element.textContent = translation;
        }
    });
    
    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        const translation = t(key);
        if (translation && translation !== key) {
            element.placeholder = translation;
        }
    });
    
    // Translate option elements
    document.querySelectorAll('option[data-i18n]').forEach(option => {
        const key = option.getAttribute('data-i18n');
        if (key) {
            const translation = t(key);
            if (translation && translation !== key) {
                option.textContent = translation;
            }
        }
    });
    
    // Update status text
    if (statusText) {
        const statusKey = isRunning ? 'status.running' : 'status.ready';
        statusText.textContent = t(statusKey);
    }
}

// Update chart label
function updateChartLabel() {
    if (visitsChart) {
        visitsChart.data.datasets[0].label = t('chart.label');
        visitsChart.update();
    }
}

// Format datetime-local
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Handle Start
async function handleStart() {
    let url = urlInput.value.trim();
    
    if (!url) {
        addLog(t('messages.urlRequired'), 'error');
        urlInput.focus();
        return;
    }
    
    // Normalize URL - add protocol if missing
    url = normalizeUrl(url);
    
    // Update input with normalized URL
    urlInput.value = url;
    
    if (!isValidUrl(url)) {
        addLog(t('messages.invalidUrl'), 'error');
        urlInput.focus();
        return;
    }
    
    const keywords = searchKeywordsTextarea.value
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
    
    if (keywords.length === 0 && searchEngineSelect.value !== 'direct') {
        addLog(t('messages.keywordsRequired'), 'warning');
        searchKeywordsTextarea.focus();
        return;
    }
    
    const config = {
        url: url,
        visitorCount: parseInt(visitorCountInput.value) || 10,
        startTime: new Date(startTimeInput.value),
        endTime: new Date(endTimeInput.value),
        distributionType: distributionTypeSelect.value,
        newVisitorRate: parseInt(newVisitorRateInput.value) || 70,
        searchKeywords: keywords.length > 0 ? keywords : ['default keyword'],
        searchEngine: searchEngineSelect.value,
        alwaysDirect: searchEngineSelect.value === 'direct',
        totalMinTime: parseInt(totalMinTimeInput.value) || 2,
        totalMaxTime: parseInt(totalMaxTimeInput.value) || 5,
        pageMinTime: parseInt(pageMinTimeInput.value) || 10,
        pageMaxTime: parseInt(pageMaxTimeInput.value) || 30,
        pageCount: parseInt(pageCountInput.value) || 10
    };
    
    // Validate times
    if (config.startTime >= config.endTime) {
        addLog(t('messages.invalidTimeRange'), 'error');
        return;
    }
    
    if (window.electronAPI) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        isRunning = true;
        updateStatus(true);
        
        addLog(t('messages.botStarting'), 'success');
        
        const result = await window.electronAPI.startBot(config);
        
        if (result.success) {
            addLog(t('messages.botStarted'), 'success');
        } else {
            addLog(`${t('messages.botAlreadyRunning')}: ${result.message}`, 'error');
            startBtn.disabled = false;
            stopBtn.disabled = true;
            isRunning = false;
            updateStatus(false);
        }
    }
}

// Handle Stop
async function handleStop() {
    if (window.electronAPI) {
        addLog(t('messages.botStopping'), 'warning');
        const result = await window.electronAPI.stopBot();
        
        if (result.success) {
            addLog(t('messages.botStopped'), 'success');
        } else {
            addLog(`${t('messages.sitemapError', {error: result.message})}`, 'error');
        }
        
        startBtn.disabled = false;
        stopBtn.disabled = true;
        isRunning = false;
        updateStatus(false);
    }
}

// Handle Check Sitemap
async function handleCheckSitemap() {
    let url = urlInput.value.trim();
    
    if (!url) {
        addLog(t('messages.urlRequired'), 'error');
        urlInput.focus();
        return;
    }
    
    // Normalize URL - add protocol if missing
    url = normalizeUrl(url);
    
    // Update input with normalized URL
    urlInput.value = url;
    
    if (!isValidUrl(url)) {
        addLog(t('messages.invalidUrl'), 'error');
        return;
    }
    
    if (window.electronAPI) {
        checkSitemapBtn.disabled = true;
        addLog(t('messages.sitemapChecking', {url: url}), '');
        
        const result = await window.electronAPI.checkSitemap(url);
        checkSitemapBtn.disabled = false;
        
        if (result.success) {
            if (result.count > 0) {
                addLog(t('messages.sitemapFound', {count: result.count}), 'success');
            } else {
                addLog(t('messages.sitemapNotFound'), 'warning');
            }
        } else {
            addLog(t('messages.sitemapError', {error: result.message}), 'error');
        }
    }
}

async function handleTestProxy() {
    if (window.electronAPI) {
        testProxyBtn.disabled = true;
        addLog(t('messages.proxyTestStarting'), '');
        
        try {
            const result = await window.electronAPI.testProxies();
            testProxyBtn.disabled = false;
            
            if (result.success && result.results) {
                const r = result.results;
                addLog(t('messages.proxyTestCompleted'), 'success');
                addLog(`${t('messages.proxyTestTotal')}: ${r.total}`, '');
                addLog(`${t('messages.proxyTestWorking')}: ${r.valid}`, 'success');
                addLog(`${t('messages.proxyTestNotWorking')}: ${r.invalid}`, 'error');
                addLog(`${t('messages.proxyTestUnsupported')}: ${r.unsupported}`, 'warning');
                
                if (r.working.length > 0) {
                    addLog(`${t('messages.proxyTestWorkingList')}: ${r.working.slice(0, 5).join(', ')}${r.working.length > 5 ? '...' : ''}`, '');
                }
            } else {
                addLog(t('messages.proxyTestError', {error: result.message || 'Unknown error'}), 'error');
            }
        } catch (error) {
            testProxyBtn.disabled = false;
            addLog(t('messages.proxyTestError', {error: error.message}), 'error');
        }
    }
}

async function handleDownloadProxy() {
    if (window.electronAPI) {
        downloadProxyBtn.disabled = true;
        addLog(t('messages.proxyDownloadStarting') || '🔍 Proxy listesi indiriliyor...', '');
        
        try {
            // Varsayılan olarak HTTP/HTTPS proxy'leri indir
            const result = await window.electronAPI.downloadProxies('proxyscrape');
            downloadProxyBtn.disabled = false;
            
            if (result.success && result.result) {
                const r = result.result;
                if (r.success) {
                    addLog(t('messages.proxyDownloadCompleted', {count: r.count, fileName: r.fileName}) || `✅ ${r.count} proxy indirildi ve kaydedildi: ${r.fileName}`, 'success');
                } else {
                    addLog(t('messages.proxyDownloadError', {error: r.error || 'Unknown error'}) || `❌ Proxy indirme hatası: ${r.error}`, 'error');
                }
            } else {
                addLog(t('messages.proxyDownloadError', {error: result.message || 'Unknown error'}) || `❌ Proxy indirme hatası: ${result.message}`, 'error');
            }
        } catch (error) {
            downloadProxyBtn.disabled = false;
            addLog(t('messages.proxyDownloadError', {error: error.message}) || `❌ Proxy indirme hatası: ${error.message}`, 'error');
        }
    }
}

async function handleCheckRanking() {
    let url = urlInput.value.trim();
    let keywords = searchKeywordsTextarea.value.trim();
    
    if (!url) {
        addLog(t('messages.urlRequired'), 'error');
        urlInput.focus();
        return;
    }
    
    if (!keywords) {
        addLog(t('messages.keywordsRequired'), 'error');
        searchKeywordsTextarea.focus();
        return;
    }
    
    // Normalize URL
    url = normalizeUrl(url);
    urlInput.value = url;
    
    if (!isValidUrl(url)) {
        addLog(t('messages.invalidUrl'), 'error');
        return;
    }
    
    // İlk keyword'ü al
    const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keywordList.length === 0) {
        addLog(t('messages.keywordsRequired'), 'error');
        return;
    }
    
    const keyword = keywordList[0]; // İlk keyword'ü kullan
    
    if (window.electronAPI) {
        checkRankingBtn.disabled = true;
        addLog(t('messages.rankingCheckStarting', {keyword: keyword, url: url}), '');
        
        try {
            const result = await window.electronAPI.checkRanking(url, keyword);
            checkRankingBtn.disabled = false;
            
            if (result.success && result.result) {
                const r = result.result;
                if (r.found) {
                    addLog(t('messages.rankingCheckFound', {position: r.position, page: r.page, keyword: keyword}), 'success');
                } else {
                    addLog(t('messages.rankingCheckNotFound', {keyword: keyword}), 'warning');
                }
            } else {
                addLog(t('messages.rankingCheckError', {error: result.message || 'Unknown error'}), 'error');
            }
        } catch (error) {
            checkRankingBtn.disabled = false;
            addLog(t('messages.rankingCheckError', {error: error.message}), 'error');
        }
    }
}

async function handleAnalyzeSEO() {
    let url = urlInput.value.trim();
    
    if (!url) {
        addLog(t('messages.urlRequired'), 'error');
        urlInput.focus();
        return;
    }
    
    // Normalize URL
    url = normalizeUrl(url);
    urlInput.value = url;
    
    if (!isValidUrl(url)) {
        addLog(t('messages.invalidUrl'), 'error');
        return;
    }
    
    if (window.electronAPI) {
        analyzeSeoBtn.disabled = true;
        seoModal.style.display = 'block';
        seoLoading.style.display = 'block';
        seoResults.style.display = 'none';
        seoResults.innerHTML = '';
        
        addLog(t('messages.seoAnalysisStarting', {url: url}), '');
        
        try {
            const result = await window.electronAPI.analyzeSEO(url);
            analyzeSeoBtn.disabled = false;
            
            if (result.success && result.analysis) {
                displaySEOAnalysis(result.analysis);
                addLog(t('messages.seoAnalysisCompleted'), 'success');
            } else {
                seoLoading.innerHTML = `<p style="color: #f44336;">${t('messages.seoAnalysisError', {error: result.message || 'Unknown error'})}</p>`;
                addLog(t('messages.seoAnalysisError', {error: result.message || 'Unknown error'}), 'error');
            }
        } catch (error) {
            analyzeSeoBtn.disabled = false;
            seoLoading.innerHTML = `<p style="color: #f44336;">${t('messages.seoAnalysisError', {error: error.message})}</p>`;
            addLog(t('messages.seoAnalysisError', {error: error.message}), 'error');
        }
    }
}

function displaySEOAnalysis(analysis) {
    seoLoading.style.display = 'none';
    seoResults.style.display = 'block';
    
    const score = analysis.score || 0;
    const scoreColor = score >= 80 ? '#4caf50' : score >= 60 ? '#ff9800' : '#f44336';
    const scoreLabel = score >= 80 ? 'Mükemmel' : score >= 60 ? 'İyi' : 'İyileştirilebilir';
    
    let html = `
        <div class="seo-score" style="background: linear-gradient(135deg, ${scoreColor} 0%, ${scoreColor}dd 100%);">
            <div class="seo-score-label">SEO Skoru</div>
            <div class="seo-score-number">${score}</div>
            <div class="seo-score-label">${scoreLabel}</div>
        </div>
    `;
    
    // Meta Tags
    const meta = analysis.checks.metaTags || {};
    html += `
        <div class="seo-section">
            <h3>📝 Meta Tags</h3>
            <div class="seo-check-item">
                <span class="seo-check-label">Title</span>
                <span class="seo-check-status ${meta.titleGood ? 'good' : 'bad'}">${meta.titleGood ? '✓ İyi' : '✗ İyileştir'}</span>
            </div>
            <div class="seo-detail"><strong>Uzunluk:</strong> ${meta.titleLength} karakter (Önerilen: 30-60)</div>
            <div class="seo-detail"><strong>İçerik:</strong> ${meta.title || 'Yok'}</div>
            
            <div class="seo-check-item">
                <span class="seo-check-label">Description</span>
                <span class="seo-check-status ${meta.descriptionGood ? 'good' : 'bad'}">${meta.descriptionGood ? '✓ İyi' : '✗ İyileştir'}</span>
            </div>
            <div class="seo-detail"><strong>Uzunluk:</strong> ${meta.descriptionLength} karakter (Önerilen: 120-160)</div>
            <div class="seo-detail"><strong>İçerik:</strong> ${meta.description || 'Yok'}</div>
            
            ${meta.ogTitle ? `<div class="seo-check-item"><span class="seo-check-label">Open Graph Title</span><span class="seo-check-status good">✓ Var</span></div>` : ''}
            ${meta.ogImage ? `<div class="seo-check-item"><span class="seo-check-label">Open Graph Image</span><span class="seo-check-status good">✓ Var</span></div>` : ''}
        </div>
    `;
    
    // Headings
    const headings = analysis.checks.headings || {};
    html += `
        <div class="seo-section">
            <h3>📑 Heading Tags</h3>
            <div class="seo-check-item">
                <span class="seo-check-label">H1 Sayısı</span>
                <span class="seo-check-status ${headings.h1Good ? 'good' : 'bad'}">${headings.h1Count} (Önerilen: 1)</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">H2 Sayısı</span>
                <span class="seo-check-value">${headings.h2Count}</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">H3 Sayısı</span>
                <span class="seo-check-value">${headings.h3Count}</span>
            </div>
        </div>
    `;
    
    // Images
    const images = analysis.checks.images || {};
    html += `
        <div class="seo-section">
            <h3>🖼️ Images</h3>
            <div class="seo-check-item">
                <span class="seo-check-label">Toplam Resim</span>
                <span class="seo-check-value">${images.total}</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">Alt Tag Yüzdesi</span>
                <span class="seo-check-status ${images.altPercentage >= 80 ? 'good' : 'warning'}">${images.altPercentage}%</span>
            </div>
            <div class="seo-detail"><strong>Alt tag'li:</strong> ${images.withAlt} | <strong>Alt tag'siz:</strong> ${images.withoutAlt}</div>
        </div>
    `;
    
    // Links
    const links = analysis.checks.links || {};
    html += `
        <div class="seo-section">
            <h3>🔗 Links</h3>
            <div class="seo-check-item">
                <span class="seo-check-label">Toplam Link</span>
                <span class="seo-check-value">${links.total}</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">Internal</span>
                <span class="seo-check-value">${links.internal}</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">External</span>
                <span class="seo-check-value">${links.external}</span>
            </div>
        </div>
    `;
    
    // Content
    const content = analysis.checks.content || {};
    html += `
        <div class="seo-section">
            <h3>📄 İçerik</h3>
            <div class="seo-check-item">
                <span class="seo-check-label">Kelime Sayısı</span>
                <span class="seo-check-status ${content.wordCountGood ? 'good' : 'warning'}">${content.wordCount} (Önerilen: 300+)</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">Karakter Sayısı</span>
                <span class="seo-check-value">${content.charCount}</span>
            </div>
        </div>
    `;
    
    // Technical
    html += `
        <div class="seo-section">
            <h3>⚙️ Teknik SEO</h3>
            <div class="seo-check-item">
                <span class="seo-check-label">HTTPS</span>
                <span class="seo-check-status ${analysis.checks.ssl?.secure ? 'good' : 'bad'}">${analysis.checks.ssl?.secure ? '✓ Güvenli' : '✗ HTTP'}</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">Mobile-Friendly</span>
                <span class="seo-check-status ${analysis.checks.mobile?.hasViewport ? 'good' : 'bad'}">${analysis.checks.mobile?.hasViewport ? '✓ Var' : '✗ Yok'}</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">Schema Markup</span>
                <span class="seo-check-status ${analysis.checks.schema?.hasSchema ? 'good' : 'warning'}">${analysis.checks.schema?.hasSchema ? `✓ ${analysis.checks.schema.schemaCount} adet` : '✗ Yok'}</span>
            </div>
            <div class="seo-check-item">
                <span class="seo-check-label">Sayfa Yükleme Süresi</span>
                <span class="seo-check-status ${analysis.loadTime < 3000 ? 'good' : 'warning'}">${Math.round(analysis.loadTime / 1000)}s</span>
            </div>
            ${analysis.checks.sitemap ? `
            <div class="seo-check-item">
                <span class="seo-check-label">Sitemap</span>
                <span class="seo-check-status ${analysis.checks.sitemap.found ? 'good' : 'bad'}">${analysis.checks.sitemap.found ? '✓ Bulundu' : '✗ Bulunamadı'}</span>
            </div>
            ` : ''}
            ${analysis.checks.robotsTxt ? `
            <div class="seo-check-item">
                <span class="seo-check-label">Robots.txt</span>
                <span class="seo-check-status ${analysis.checks.robotsTxt.found ? 'good' : 'warning'}">${analysis.checks.robotsTxt.found ? '✓ Var' : '⚠ Yok'}</span>
            </div>
            ` : ''}
        </div>
    `;
    
    // AI Destekli Öneriler
    if (analysis.recommendations && analysis.recommendations.length > 0) {
        html += `
            <div class="seo-section" style="border-left-color: #667eea; background: #f0f4ff;">
                <h3>🤖 AI Destekli SEO Önerileri</h3>
                <p style="margin-bottom: 15px; color: #666; font-size: 14px;">Analiz sonuçlarına göre özelleştirilmiş öneriler:</p>
        `;
        
        analysis.recommendations.forEach((rec, index) => {
            var priorityColor = rec.priority === 'high' ? '#f44336' : rec.priority === 'medium' ? '#ff9800' : '#4caf50';
            var priorityLabel = rec.priority === 'high' ? 'Yüksek Öncelik' : rec.priority === 'medium' ? 'Orta Öncelik' : 'Düşük Öncelik';
            
            html += `
                <div class="seo-recommendation" style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid ${priorityColor};">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 600; color: #333; margin-bottom: 5px;">${index + 1}. ${rec.issue}</div>
                            <div style="font-size: 12px; color: ${priorityColor}; font-weight: 600;">${priorityLabel}</div>
                        </div>
                        <span style="font-size: 12px; color: #666; background: #f5f5f5; padding: 4px 8px; border-radius: 4px;">${rec.category}</span>
                    </div>
                    <div style="color: #555; margin-bottom: 10px; line-height: 1.6;">${rec.recommendation}</div>
                    ${rec.example ? `
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-top: 10px; font-family: monospace; font-size: 12px; color: #333;">
                        <strong>Örnek:</strong><br>${rec.example.replace(/\n/g, '<br>')}
                    </div>
                    ` : ''}
                    <div style="margin-top: 10px; font-size: 12px; color: #667eea;">
                        <strong>Etki:</strong> ${rec.impact}
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    seoResults.innerHTML = html;
}

async function handlePingBots() {
    let url = urlInput.value.trim();
    
    if (!url) {
        addLog(t('messages.urlRequired'), 'error');
        urlInput.focus();
        return;
    }
    
    // Normalize URL
    url = normalizeUrl(url);
    urlInput.value = url;
    
    if (!isValidUrl(url)) {
        addLog(t('messages.invalidUrl'), 'error');
        return;
    }
    
    if (window.electronAPI) {
        pingBotsBtn.disabled = true;
        addLog(t('messages.pingBotsStarting', {url: url}), '');
        
        try {
            const result = await window.electronAPI.pingSearchEngines(url);
            pingBotsBtn.disabled = false;
            
            if (result.success && result.results) {
                const r = result.results;
                addLog(t('messages.pingBotsCompleted'), 'success');
                
                // Ping sonuçlarını göster
                if (r.pings.googleSitemap) {
                    if (r.pings.googleSitemap.success) {
                        addLog(`✅ Google: ${r.pings.googleSitemap.message}`, 'success');
                    } else {
                        addLog(`⚠️ Google: ${r.pings.googleSitemap.message}`, 'warning');
                    }
                }
                
                if (r.pings.bingSitemap) {
                    if (r.pings.bingSitemap.success) {
                        addLog(`✅ Bing: ${r.pings.bingSitemap.message}`, 'success');
                    } else {
                        addLog(`⚠️ Bing: ${r.pings.bingSitemap.message}`, 'warning');
                    }
                }
                
                if (r.errors && r.errors.length > 0) {
                    r.errors.forEach(err => {
                        addLog(`⚠️ ${err}`, 'warning');
                    });
                }
                
                addLog(t('messages.pingBotsNote'), '');
            } else {
                addLog(t('messages.pingBotsError', {error: result.message || 'Unknown error'}), 'error');
            }
        } catch (error) {
            pingBotsBtn.disabled = false;
            addLog(t('messages.pingBotsError', {error: error.message}), 'error');
        }
    }
}

// Add Log
function addLog(message, type = '') {
    // Remove placeholder
    const placeholder = logsContainer.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    // Check if message is i18n format: I18N:key|param1|param2
    let displayMessage = message;
    if (message.startsWith('I18N:')) {
        try {
            const parts = message.substring(5).split('|');
            const key = parts[0];
            const params = {};
            
            // Parse parameters (key:value pairs)
            for (let i = 1; i < parts.length; i++) {
                const param = parts[i];
                if (param.includes(':')) {
                    const [paramKey, paramValue] = param.split(':');
                    params[paramKey] = paramValue;
                } else {
                    // If no key, use index
                    params[i - 1] = param;
                }
            }
            
            displayMessage = t(key, params);
        } catch (e) {
            console.error('Failed to parse i18n log message:', e);
            displayMessage = message;
        }
    }
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    const localeMap = {
        'tr': 'tr-TR',
        'en': 'en-US',
        'de': 'de-DE',
        'fr': 'fr-FR',
        'ru': 'ru-RU',
        'ja': 'ja-JP',
        'ko': 'ko-KR'
    };
    const locale = localeMap[currentLanguage] || 'en-US';
    logEntry.textContent = `[${new Date().toLocaleTimeString(locale)}] ${displayMessage}`;
    
    logsContainer.insertBefore(logEntry, logsContainer.firstChild);
    
    // Keep only last 500 logs
    while (logsContainer.children.length > 500) {
        logsContainer.removeChild(logsContainer.lastChild);
    }
}

// Show About Dialog
function showAboutDialog() {
    const version = '1.4.0';
    
    // Create modal for About dialog
    const aboutModal = document.createElement('div');
    aboutModal.className = 'modal';
    aboutModal.style.display = 'flex';
    aboutModal.id = 'about-modal';
    
    aboutModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>ℹ️ Hakkında</h2>
                <button class="modal-close" id="about-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #667eea; margin-bottom: 10px;">🚀 Google SEO Bot</h1>
                    <p style="color: #666; font-size: 14px;">v${version}</p>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <p style="color: #555; line-height: 1.6; margin-bottom: 15px;">
                        Organik trafik simülasyonu ile SEO sıralamanızı yükseltin.
                    </p>
                </div>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
                    <h3 style="color: #667eea; margin-bottom: 10px; font-size: 16px;">📄 Lisans Bilgisi</h3>
                    <p style="color: #666; font-size: 13px; margin: 5px 0;">
                        <strong>Lisans:</strong> Proprietary
                    </p>
                    <p style="color: #666; font-size: 13px; margin: 5px 0;">
                        <strong>Telif Hakkı:</strong> © 2024 emrahkartals
                    </p>
                    <p style="color: #666; font-size: 13px; margin: 5px 0;">
                        <strong>Durum:</strong> Tüm hakları saklıdır
                    </p>
                </div>
                
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                    <p style="color: #856404; font-size: 12px; margin: 0; line-height: 1.5;">
                        ⚠️ <strong>Uyarı:</strong> Bu yazılım proprietary lisans altındadır. 
                        Kopyalama, değiştirme, dağıtım ve ticari kullanım yasaktır. 
                        İzinsiz kullanım yasal işlemlere tabi tutulabilir.
                    </p>
                </div>
                
                <div style="text-align: center; padding-top: 15px; border-top: 2px solid #e0e0e0;">
                    <p style="color: #999; font-size: 12px; margin: 5px 0;">
                        <strong>Geliştirici:</strong> <span style="color: #667eea; font-weight: 700;">emrahkartals</span>
                    </p>
                    <p style="color: #999; font-size: 12px; margin: 5px 0;">
                        GitHub: <a href="https://github.com/emrahkartals/google-seo-bot" target="_blank" style="color: #667eea; text-decoration: none;">github.com/emrahkartals/google-seo-bot</a>
                    </p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(aboutModal);
    
    // Close button
    const closeBtn = aboutModal.querySelector('#about-modal-close');
    closeBtn.addEventListener('click', () => {
        aboutModal.remove();
    });
    
    // Close on outside click
    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) {
            aboutModal.remove();
        }
    });
    
    // Close on ESC key
    const handleEsc = (e) => {
        if (e.key === 'Escape' && aboutModal.parentNode) {
            aboutModal.remove();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// API Settings Functions
function openApiSettings() {
    // Load saved API keys
    const openaiKey = localStorage.getItem('openai_api_key') || '';
    const anthropicKey = localStorage.getItem('anthropic_api_key') || '';
    const googleKey = localStorage.getItem('google_api_key') || '';
    
    openaiApiKeyInput.value = openaiKey;
    anthropicApiKeyInput.value = anthropicKey;
    googleApiKeyInput.value = googleKey;
    
    // Reset visibility toggles
    openaiApiKeyInput.type = 'password';
    anthropicApiKeyInput.type = 'password';
    googleApiKeyInput.type = 'password';
    
    apiSettingsModal.style.display = 'flex';
}

function handleSaveApiKeys() {
    const openaiKey = openaiApiKeyInput.value.trim();
    const anthropicKey = anthropicApiKeyInput.value.trim();
    const googleKey = googleApiKeyInput.value.trim();
    
    // Save to localStorage
    if (openaiKey) {
        localStorage.setItem('openai_api_key', openaiKey);
    } else {
        localStorage.removeItem('openai_api_key');
    }
    
    if (anthropicKey) {
        localStorage.setItem('anthropic_api_key', anthropicKey);
    } else {
        localStorage.removeItem('anthropic_api_key');
    }
    
    if (googleKey) {
        localStorage.setItem('google_api_key', googleKey);
    } else {
        localStorage.removeItem('google_api_key');
    }
    
    addLog(t('messages.apiKeysSaved') || '✅ API key\'ler kaydedildi!', 'success');
    apiSettingsModal.style.display = 'none';
}

function handleClearApiKeys() {
    if (confirm(t('messages.apiKeysClearConfirm') || 'Tüm API key\'leri temizlemek istediğinize emin misiniz?')) {
        localStorage.removeItem('openai_api_key');
        localStorage.removeItem('anthropic_api_key');
        localStorage.removeItem('google_api_key');
        
        openaiApiKeyInput.value = '';
        anthropicApiKeyInput.value = '';
        googleApiKeyInput.value = '';
        
        addLog(t('messages.apiKeysCleared') || '✅ API key\'ler temizlendi!', 'success');
    }
}

function togglePasswordVisibility(input, button) {
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
}

// Get API keys (for use in other functions)
function getApiKeys() {
    return {
        openai: localStorage.getItem('openai_api_key') || null,
        anthropic: localStorage.getItem('anthropic_api_key') || null,
        google: localStorage.getItem('google_api_key') || null
    };
}

// Clear Logs
function clearLogs() {
    const placeholder = document.createElement('div');
    placeholder.className = 'log-placeholder';
    placeholder.setAttribute('data-i18n', 'logs.placeholder');
    placeholder.textContent = t('logs.placeholder');
    logsContainer.innerHTML = '';
    logsContainer.appendChild(placeholder);
    totalVisits = 0;
    totalVisitsSpan.textContent = '0';
    lastVisitSpan.textContent = '-';
    resetChart();
}

// Update Status
function updateStatus(running) {
    isRunning = running;
    statusDot.className = `status-dot ${running ? 'running' : 'stopped'}`;
    statusText.textContent = running ? t('status.running') : t('status.ready');
    
    if (running) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// Normalize URL - Add protocol if missing
function normalizeUrl(url) {
    if (!url) return url;
    
    url = url.trim();
    
    // If URL already has protocol, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    
    // Add https:// by default
    return 'https://' + url;
}

// Validate URL
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// Initialize Chart
function initChart() {
    if (!chartCanvas || !window.Chart) {
        console.error('Chart.js not loaded');
        return;
    }
    
    const ctx = chartCanvas.getContext('2d');
    
    visitsChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: visitData.labels,
            datasets: [{
                label: t('chart.label'),
                data: visitData.data,
                borderColor: 'rgb(102, 126, 234)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: 'rgb(102, 126, 234)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 750
            }
        }
    });
}

// Update Chart
function updateChart(visitTime) {
    if (!visitsChart) return;
    
    const timeLabel = visitTime.toLocaleTimeString('tr-TR', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Add new data point
    visitData.labels.push(timeLabel);
    visitData.data.push(totalVisits);
    
    // Keep only last 50 data points
    if (visitData.labels.length > 50) {
        visitData.labels.shift();
        visitData.data.shift();
    }
    
    // Update chart
    visitsChart.data.labels = visitData.labels;
    visitsChart.data.datasets[0].data = visitData.data;
    visitsChart.update('active');
}

// Toggle Chart Type
function toggleChartType() {
    if (!visitsChart) return;
    
    chartType = chartType === 'line' ? 'bar' : 'line';
    
    // Destroy old chart
    visitsChart.destroy();
    
    // Create new chart with new type
    const ctx = chartCanvas.getContext('2d');
    visitsChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: visitData.labels,
            datasets: [{
                label: t('chart.label'),
                data: visitData.data,
                borderColor: 'rgb(102, 126, 234)',
                backgroundColor: chartType === 'bar' 
                    ? 'rgba(102, 126, 234, 0.6)' 
                    : 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                fill: chartType === 'line',
                tension: chartType === 'line' ? 0.4 : 0,
                pointRadius: chartType === 'line' ? 4 : 0,
                pointHoverRadius: chartType === 'line' ? 6 : 0,
                pointBackgroundColor: 'rgb(102, 126, 234)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 750
            }
        }
    });
    
    // Update button text
    chartTypeBtn.textContent = chartType === 'line' ? t('buttons.bar') : t('buttons.line');
}

// Reset Chart
function resetChart() {
    if (!visitsChart) return;
    
    visitData.labels = [];
    visitData.data = [];
    
    visitsChart.data.labels = [];
    visitsChart.data.datasets[0].data = [];
    visitsChart.update();
    
    addLog(t('messages.chartReset'), 'success');
}

