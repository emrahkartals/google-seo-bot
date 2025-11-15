const { app, BrowserWindow, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const bot = require('./libs/index');

let mainWindow;
let isRunning = false;
let currentLanguage = 'tr'; // Varsayılan dil
let menuTranslations = {}; // Menü çevirileri

// Menü çevirilerini yükle
function loadMenuTranslations(lang) {
    try {
        const translationsPath = path.join(__dirname, 'locales', `${lang}.json`);
        if (fs.existsSync(translationsPath)) {
            const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
            menuTranslations = translations.menu || {};
            console.log(`[MENU] Loaded menu translations for language: ${lang}`, Object.keys(menuTranslations).length, 'keys');
        } else {
            console.warn(`[MENU] Translation file not found: ${translationsPath}, falling back to Turkish`);
            // Fallback to Turkish
            const fallbackPath = path.join(__dirname, 'locales', 'tr.json');
            if (fs.existsSync(fallbackPath)) {
                const translations = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
                menuTranslations = translations.menu || {};
            }
        }
    } catch (error) {
        console.error('Failed to load menu translations:', error);
        menuTranslations = {};
    }
}

// Menü şablonu oluştur
function createMenu() {
    const t = (key) => {
        const translation = menuTranslations[key];
        return translation || key;
    };
    
    const template = [
        {
            label: t('file'),
            submenu: [
                {
                    label: t('reload'),
                    accelerator: 'CmdOrCtrl+R',
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {
                            focusedWindow.reload();
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: t('exit'),
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: t('bot'),
            submenu: [
                {
                    label: t('start'),
                    accelerator: 'CmdOrCtrl+S',
                    enabled: true,
                    click: () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('menu-start-bot');
                        }
                    }
                },
                {
                    label: t('stop'),
                    accelerator: 'CmdOrCtrl+Shift+S',
                    enabled: true,
                    click: () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('menu-stop-bot');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: t('checkSitemap'),
                    accelerator: 'CmdOrCtrl+K',
                    click: () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('menu-check-sitemap');
                        }
                    }
                }
            ]
        },
        {
            label: t('settings'),
            submenu: [
                {
                    label: t('apiSettings'),
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('menu-open-settings');
                        }
                    }
                }
            ]
        },
        {
            label: t('view'),
            submenu: [
                {
                    label: t('reload'),
                    accelerator: 'F5',
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {
                            focusedWindow.reload();
                        }
                    }
                },
                {
                    label: t('fullScreen'),
                    accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {
                            focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: t('developerTools'),
                    accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
                    click: (item, focusedWindow) => {
                        if (focusedWindow) {
                            focusedWindow.webContents.toggleDevTools();
                        }
                    }
                },
                { type: 'separator' },
                { role: 'resetZoom', label: t('resetZoom') },
                { role: 'zoomIn', label: t('zoomIn') },
                { role: 'zoomOut', label: t('zoomOut') }
            ]
        },
        {
            label: t('help'),
            submenu: [
                {
                    label: t('about'),
                    click: () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('menu-about');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: t('github'),
                    click: () => {
                        require('electron').shell.openExternal('https://github.com/emrahkartals/google-seo-bot');
                    }
                },
                {
                    label: t('documentation'),
                    click: () => {
                        require('electron').shell.openExternal('https://github.com/emrahkartals/google-seo-bot#readme');
                    }
                }
            ]
        }
    ];

    // macOS için menü düzenlemesi
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                { role: 'about', label: t('about') },
                { type: 'separator' },
                { role: 'services', label: t('services') },
                { type: 'separator' },
                { role: 'hide', label: t('hide') },
                { role: 'hideothers', label: t('hideOthers') },
                { role: 'unhide', label: t('show') },
                { type: 'separator' },
                { role: 'quit', label: t('exit') }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets', 'icon.png'), // Opsiyonel icon
        titleBarStyle: 'default',
        show: false
    });

    mainWindow.loadFile('index.html');
    
    // Karanlık tema desteği için nativeTheme ayarla
    // Windows'ta menü için karanlık tema desteği
    if (process.platform === 'win32') {
        // Windows'ta menü için karanlık tema desteği yok, ancak pencere için ayarlayabiliriz
        nativeTheme.themeSource = 'system'; // Sistem temasını takip et
    }

    // Pencere hazır olduğunda göster
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Dev tools (geliştirme için)
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Bot log callback
bot.setLogCallback((message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log-message', message);
    }
});

// Bot visit callback
bot.setVisitCallback((visit) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('visit-recorded', visit);
    }
});

// Bot ranking callback
bot.setRankingCallback((ranking) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ranking-recorded', ranking);
    }
});

// IPC Handlers
ipcMain.handle('start-bot', async (event, config) => {
    if (isRunning) {
        return { success: false, message: 'Bot zaten çalışıyor!' };
    }
    
    try {
        isRunning = true;
        // Async olarak başlat, await kullanma (non-blocking)
        bot.start(config).catch((error) => {
            isRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('log-message', `❌ Bot hatası: ${error.message}`);
            }
        });
        return { success: true, message: 'Bot başlatıldı' };
    } catch (error) {
        isRunning = false;
        return { success: false, message: error.message };
    }
});

ipcMain.handle('stop-bot', async () => {
    try {
        await bot.stop();
        isRunning = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('log-message', '⏹️ Bot durduruldu');
        }
        return { success: true, message: 'Bot durduruldu' };
    } catch (error) {
        isRunning = false;
        return { success: false, message: error.message };
    }
});

ipcMain.handle('check-sitemap', async (event, url) => {
    try {
        const count = await bot.checkSitemap(url);
        return { success: true, count: count };
    } catch (error) {
        return { success: false, message: error.message, count: 0 };
    }
});

ipcMain.handle('get-bot-status', () => {
    return { isRunning: isRunning };
});

ipcMain.handle('test-proxies', async () => {
    try {
        const results = await bot.testProxies();
        return { success: true, results: results };
    } catch (error) {
        return { success: false, message: error.message, results: null };
    }
});

ipcMain.handle('check-ranking', async (event, url, keyword) => {
    try {
        const result = await bot.checkRanking(url, keyword);
        return { success: true, result: result };
    } catch (error) {
        return { success: false, message: error.message, result: null };
    }
});

ipcMain.handle('analyze-seo', async (event, url) => {
    try {
        const analysis = await bot.analyzeSEO(url);
        return { success: true, analysis: analysis };
    } catch (error) {
        return { success: false, message: error.message, analysis: null };
    }
});

ipcMain.handle('ping-search-engines', async (event, url) => {
    try {
        const results = await bot.pingSearchEngines(url);
        return { success: true, results: results };
    } catch (error) {
        return { success: false, message: error.message, results: null };
    }
});

ipcMain.handle('download-proxies', async (event, source) => {
    try {
        const result = await bot.downloadProxies(source || 'proxyscrape');
        return { success: true, result: result };
    } catch (error) {
        return { success: false, message: error.message, result: null };
    }
});

// Dil değiştirme handler
ipcMain.handle('set-language', async (event, lang) => {
    try {
        currentLanguage = lang || 'tr';
        loadMenuTranslations(currentLanguage);
        createMenu(); // Menüyü yeniden oluştur
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// Tema değiştirme handler
ipcMain.handle('set-theme', async (event, isDark) => {
    try {
        if (isDark) {
            nativeTheme.themeSource = 'dark';
        } else {
            nativeTheme.themeSource = 'light';
        }
        // Menüyü yeniden oluştur (Windows'ta menü görünümü değişmez ama yine de güncelleyelim)
        createMenu();
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// Uygulama hazır olduğunda pencere oluştur
app.whenReady().then(() => {
    loadMenuTranslations(currentLanguage); // Menü çevirilerini yükle
    createMenu(); // Menüyü oluştur
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Tüm pencereler kapatıldığında
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Uygulama kapanmadan önce bot'u durdur
app.on('before-quit', async () => {
    if (isRunning) {
        await bot.stop();
    }
});

