const { contextBridge, ipcRenderer } = require('electron');

// Güvenli API'yi expose et
contextBridge.exposeInMainWorld('electronAPI', {
    // Bot kontrolü
    startBot: (config) => ipcRenderer.invoke('start-bot', config),
    stopBot: () => ipcRenderer.invoke('stop-bot'),
    checkSitemap: (url) => ipcRenderer.invoke('check-sitemap', url),
    getBotStatus: () => ipcRenderer.invoke('get-bot-status'),
    testProxies: () => ipcRenderer.invoke('test-proxies'),
    checkRanking: (url, keyword) => ipcRenderer.invoke('check-ranking', url, keyword),
    analyzeSEO: (url) => ipcRenderer.invoke('analyze-seo', url),
    pingSearchEngines: (url) => ipcRenderer.invoke('ping-search-engines', url),
    downloadProxies: (source) => ipcRenderer.invoke('download-proxies', source),
    
    // Event listeners
    onLogMessage: (callback) => {
        ipcRenderer.on('log-message', (event, message) => callback(message));
    },
    onVisitRecorded: (callback) => {
        ipcRenderer.on('visit-recorded', (event, visit) => callback(visit));
    },
    onRankingRecorded: (callback) => {
        ipcRenderer.on('ranking-recorded', (event, ranking) => callback(ranking));
    },
    
    // Menu event listeners
    onMenuStartBot: (callback) => {
        ipcRenderer.on('menu-start-bot', () => callback());
    },
    onMenuStopBot: (callback) => {
        ipcRenderer.on('menu-stop-bot', () => callback());
    },
    onMenuCheckSitemap: (callback) => {
        ipcRenderer.on('menu-check-sitemap', () => callback());
    },
    onMenuAbout: (callback) => {
        ipcRenderer.on('menu-about', () => callback());
    },
    onMenuOpenSettings: (callback) => {
        ipcRenderer.on('menu-open-settings', () => callback());
    },
    
    // Language
    setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),
    
    // Theme
    setTheme: (isDark) => ipcRenderer.invoke('set-theme', isDark),
    
    // Cleanup
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

