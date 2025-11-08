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
const clearLogsBtn = document.getElementById('clear-logs-btn');
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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load translations
    await loadTranslations(currentLanguage);
    applyTranslations();
    
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
    clearLogsBtn.addEventListener('click', clearLogs);
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
    const version = '1.0.0';
    const message = `Google SEO Bot v${version}\n\nOrganik trafik simülasyonu ile SEO sıralamanızı yükseltin.\n\nGitHub: https://github.com/emrahkartals/google-seo-bot\n\n© 2024 emrahkartals`;
    alert(message);
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

