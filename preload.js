const { contextBridge, ipcRenderer } = require('electron');

// Güvenli API'yi expose et
contextBridge.exposeInMainWorld('electronAPI', {
    // Bot kontrolü
    startBot: (config) => ipcRenderer.invoke('start-bot', config),
    stopBot: () => ipcRenderer.invoke('stop-bot'),
    checkSitemap: (url) => ipcRenderer.invoke('check-sitemap', url),
    getBotStatus: () => ipcRenderer.invoke('get-bot-status'),
    testProxies: () => ipcRenderer.invoke('test-proxies'),
    
    // Event listeners
    onLogMessage: (callback) => {
        ipcRenderer.on('log-message', (event, message) => callback(message));
    },
    onVisitRecorded: (callback) => {
        ipcRenderer.on('visit-recorded', (event, visit) => callback(visit));
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
    
    // Cleanup
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

