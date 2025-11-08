const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const bot = require('./libs/index');

let mainWindow;
let isRunning = false;

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

// Uygulama hazır olduğunda pencere oluştur
app.whenReady().then(() => {
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

