const { app, BrowserWindow, ipcMain, shell, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const os = require('os');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const { autoUpdater } = require('electron-updater');

const documentsPath = app.getPath('documents');
const timeLogPath = path.join(documentsPath, 'time-tracking.log.csv');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

let mainWindow;
let inputWindow;
let tray = null;

// --- Settings Management ---

async function getSettings() {
    try {
        // Case 1: User already has settings. Load them.
        if (fs.existsSync(settingsPath)) {
            const data = await fsPromises.readFile(settingsPath, 'utf8');
            return JSON.parse(data);
        }

        // Case 2: No user settings yet. Check for shipped defaults.
        const defaultSettingsPath = path.join(__dirname, 'default-settings.json');
        let initialSettings = {
            keybindings: {
                start: "CmdOrCtrl+Shift+S",
                pause: "CmdOrCtrl+Shift+P",
                stop: "CmdOrCtrl+Shift+X"
            }
        };

        if (fs.existsSync(defaultSettingsPath)) {
            try {
                const defaultData = await fsPromises.readFile(defaultSettingsPath, 'utf8');
                initialSettings = JSON.parse(defaultData);
                console.log("Initialized settings from default-settings.json");
            } catch (err) {
                console.error("Failed to load default-settings.json:", err);
            }
        }

        // Write the initial settings (either from file or hardcoded fallback) to the user's data path
        await fsPromises.writeFile(settingsPath, JSON.stringify(initialSettings, null, 2));
        return initialSettings;

    } catch (error) {
        console.error("Failed to read settings, returning defaults:", error);
        return { keybindings: {} }; 
    }
}

async function saveSettings(settings) {
    try {
        await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        // After saving, re-register the shortcuts
        await registerShortcuts();
        return { success: true };
    } catch (error) {
        console.error("Failed to save settings:", error);
        return { success: false, message: error.message };
    }
}

ipcMain.handle('get-settings', getSettings);
ipcMain.handle('save-settings', (event, settings) => saveSettings(settings));


// --- Global Shortcuts ---

async function registerShortcuts() {
    // Unregister all shortcuts first to avoid conflicts
    globalShortcut.unregisterAll();

    const settings = await getSettings();
    const keybindings = settings.keybindings || {};

    Object.entries(keybindings).forEach(([action, accelerator]) => {
        if (accelerator) {
            try {
                globalShortcut.register(accelerator, () => {
                    if (mainWindow) {
                        mainWindow.webContents.send('global-shortcut', action);
                    }
                });
            } catch (error) {
                console.error(`Failed to register shortcut for ${action} with accelerator ${accelerator}:`, error);
            }
        }
    });
}

// --- Window Management ---

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1024, // Increased width for better layout
        height: 768,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'icon.png'), // Set the application icon
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createInputWindow(timeToSave) {
    if (inputWindow) {
        inputWindow.focus();
        return;
    }
    inputWindow = new BrowserWindow({
        width: 400,
        height: 350,
        resizable: true, // Re-enable resizing
        parent: mainWindow,
        modal: true,
        webPreferences: {
            preload: path.join(__dirname, 'input-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
        inputWindow.loadFile('input-window.html');
    
            inputWindow.webContents.on('did-finish-load', async () => {
                const settings = await getSettings();
                inputWindow.webContents.send('time-data', { 
                    time: timeToSave, 
                    projects: settings.projects || [],
                    theme: settings.theme || 'dark' 
                });
            });    
        inputWindow.on('closed', () => {
        inputWindow = null;
    });
}

app.whenReady().then(async () => {
    createMainWindow();
    await registerShortcuts();

    // --- Create System Tray Icon ---
    const iconPath = path.join(__dirname, 'icon.png');
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show App', 
            click: () => {
                mainWindow.show();
            } 
        },
        { 
            label: 'Quit', 
            click: () => {
                app.isQuitting = true;
                app.quit();
            } 
        }
    ]);

    tray.setToolTip('TheHub');
    tray.setContextMenu(contextMenu);

    // Show window on single click
    tray.on('click', () => {
        mainWindow.show();
    });
    // --- End System Tray ---

    // --- Auto-Updater Logic and Logging ---
    autoUpdater.on('checking-for-update', () => {
        mainWindow.webContents.send('update-log', 'Checking for update...');
    });
    autoUpdater.on('update-available', (info) => {
        mainWindow.webContents.send('update-log', `Update available: v${info.version}`);
    });
    autoUpdater.on('update-not-available', (info) => {
        mainWindow.webContents.send('update-log', `Update not available. You are on the latest version (v${info.version}).`);
    });
    autoUpdater.on('error', (err) => {
        mainWindow.webContents.send('update-log', `Error in auto-updater: ${err.toString()}`);
    });
    autoUpdater.on('download-progress', (progressObj) => {
        let log_message = `Downloaded ${Math.round(progressObj.percent)}% (${Math.round(progressObj.bytesPerSecond / 1024)} KB/s)`;
        mainWindow.webContents.send('update-log', log_message);
    });
    autoUpdater.on('update-downloaded', (info) => {
        mainWindow.webContents.send('update-log', `Update v${info.version} downloaded. It will be installed on the next restart. Relaunch the application to apply the update.`);
    });

    // Check for updates on startup
    autoUpdater.checkForUpdatesAndNotify();

    // Check for updates every 6 hours
    setInterval(() => {
        autoUpdater.checkForUpdates();
    }, 6 * 60 * 60 * 1000);

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
});

app.on('will-quit', () => {
    // Unregister all shortcuts when the application is about to quit
    globalShortcut.unregisterAll();
});

// --- IPC Handlers for Renderer ---

ipcMain.handle('open-input-window', (event, timeToSave) => {
    return new Promise((resolve) => {
        createInputWindow(timeToSave);
        ipcMain.once('save-log-from-input-window', async (event, logData) => {
            await handleSaveTime(mainWindow.webContents, logData);
            if (inputWindow) {
                inputWindow.close();
            }
            resolve({ success: true });
        });
    });
});

ipcMain.on('resize-input-window', (event, height) => {
    if (inputWindow) {
        const [width] = inputWindow.getContentSize();
        inputWindow.setContentSize(width, height);
    }
});

// --- Data Handling ---

async function handleSaveTime(sender, { time, description, project }) {
    const header = 'Date,Time Logged,Description,Points,Project\n';
    const timeParts = time.split(':').map(Number);
    const totalMinutes = timeParts[0] * 60 + timeParts[1] + timeParts[2] / 60;
    const points = Math.floor(totalMinutes / 15);
    const now = new Date();
    const dateFormatted = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const row = `${dateFormatted},${time},"${description}",${points},"${project || ''}"\n`;

    if (!fs.existsSync(timeLogPath)) {
        await fsPromises.writeFile(timeLogPath, header);
    }
    
    await fsPromises.writeFile(timeLogPath, row, { flag: 'a' });
    
    return { success: true };
}

ipcMain.handle('save-time', async (event, logData) => {
    return handleSaveTime(event.sender, logData);
});

async function readLogsFromFile() {
    if (!fs.existsSync(timeLogPath)) {
        return [];
    }
    const data = await fsPromises.readFile(timeLogPath, 'utf8');
    const rows = data.split('\n').filter(row => row.trim() !== '');
    
    if (rows.length < 1) {
        return [];
    }

    const headers = rows.shift().split(',').map(h => h.trim());
    const hasProjectColumn = headers.includes('Project');

    return rows.map(row => {
        const parts = row.split(',');
        if (parts.length < (hasProjectColumn ? 5 : 4)) {
            console.warn(`Malformed log row skipped: ${row}`);
            return null; 
        }

        const rawDate = parts.shift();
        const date = normalizeDateToYYYYMMDD(rawDate);
        const time = parts.shift();
        let description, points, project = '';

        if (hasProjectColumn) {
            project = parts.pop().replace(/^"|"$/g, '');
            points = parts.pop();
            description = parts.join(',').replace(/^"|"$/g, '');
        } else {
            points = parts.pop();
            description = parts.join(',').replace(/^"|"$/g, '');
        }
        
        return { date, time, description, points: parseInt(points) || 0, project };
    }).filter(log => log !== null);
}

async function writeLogsToFile(logs) {
    const header = 'Date,Time Logged,Description,Points,Project\n';
    const content = header + logs.map(log => 
        `${log.date},${log.time},"${log.description}",${log.points},"${log.project || ''}"`
    ).join('\n');
    await fsPromises.writeFile(timeLogPath, content.trim() + '\n');
}

function normalizeDateToYYYYMMDD(dateString) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
        const parts = dateString.split('/');
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    const dateObj = new Date(dateString);
    if (!isNaN(dateObj)) {
        return `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getDate().toString().padStart(2, '0')}`;
    }
    return dateString;
}

ipcMain.handle('get-time-logs', readLogsFromFile);
ipcMain.handle('get-username', () => os.userInfo().username);
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('check-for-update', () => {
    autoUpdater.checkForUpdates();
});

ipcMain.on('save-cmf', async (event, data) => {
    const { dialog } = require('electron');
    try {
        const templatePath = path.join(__dirname, 'template.docx');
        const content = await fsPromises.readFile(templatePath, 'binary');

        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            delimiters: {
                start: '{{',
                end: '}}',
            },
            paragraphLoop: true,
            linebreaks: true,
        });

        doc.render({
            SYSTEM_USER: os.userInfo().username,
            AUTHOR: data.requestor || os.userInfo().username, // Fallback for uppercase tag if present
            DATE: new Date().toLocaleDateString(), // Fallback for uppercase tag if present
            ...data, // This contains the lowercase keys: requestor, date, etc.
        });

        const buf = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });

        const { filePath } = await dialog.showSaveDialog({
            title: 'Save CMF As',
            defaultPath: path.join(app.getPath('documents'), `${data.CHANGE_NAME.replace(/\s+/g, '-')}-cmf.docx`),
            filters: [{ name: 'Word Documents', extensions: ['docx'] }]
        });

        if (filePath) {
            await fsPromises.writeFile(filePath, buf);
            shell.openPath(filePath); // Automatically open the file
            mainWindow.webContents.send('cmf-saved-successfully');
        }
    } catch (error) {
        console.error('Failed to create CMF file:', error);
    }
});

ipcMain.handle('delete-time-log', async (event, logIdentifier) => {
    if (!logIdentifier || typeof logIdentifier !== 'string' || logIdentifier === '') {
        console.error("[BACKEND-ERROR] Invalid log identifier received for deletion:", logIdentifier);
        return { success: false, message: "Invalid log identifier provided." };
    }

    try {
        let logs = await readLogsFromFile();
        const logToDelete = JSON.parse(decodeURIComponent(logIdentifier));
        
        console.log("--- [BACKEND DELETE ATTEMPT] ---");
        console.log("Entire log file content:", logs);
        console.log("Log to delete (from frontend):", logToDelete);
        console.log("---");

        const initialLength = logs.length;
        
        const filteredLogs = logs.filter(log => {
            const dateMatch = (log.date || '').trim() === (logToDelete.date || '').trim();
            const timeMatch = (log.time || '').trim() === (logToDelete.time || '').trim();
            const descMatch = (log.description || '').trim() === (logToDelete.description || '').trim();
            const projectMatch = (log.project || '').trim() === (logToDelete.project || '').trim();
            
            const isMatch = dateMatch && timeMatch && descMatch && projectMatch;
            return !isMatch;
        });

        if (filteredLogs.length < initialLength) {
            console.log("MATCH FOUND. Deleting log.");
            await writeLogsToFile(filteredLogs);
            event.sender.send('logs-updated');
            return { success: true };
        }
        
        console.warn("NO MATCH FOUND. Log to delete was not found in the file. No changes made.");
        return { success: false, message: "Log not found." };
    } catch (error) {
        console.error("[BACKEND-ERROR] Error in delete-time-log handler:", error);
        return { success: false, message: "Failed to delete log due to an error." };
    }
});
ipcMain.handle('update-time-log', async (event, { oldDate, oldTime, oldDescription, oldProject, newDate, newTime, newDescription, newProject }) => {
    let logs = await readLogsFromFile();
    const index = logs.findIndex(log => 
        log.date === oldDate && log.time === oldTime && log.description === oldDescription && (log.project || '') === (oldProject || '')
    );
    if (index !== -1) {
        const timeParts = newTime.split(':').map(Number);
        const totalMinutes = timeParts[0] * 60 + timeParts[1] + timeParts[2] / 60;
        logs[index] = {
            date: newDate,
            time: newTime,
            description: newDescription,
            points: Math.floor(totalMinutes / 15),
            project: newProject || ''
        };
        await writeLogsToFile(logs);
        event.sender.send('logs-updated');
        return { success: true };
    }
    return { success: false, message: "Log not found." };
});
ipcMain.handle('export-logs-json', async (event, { logs, startDate, endDate }) => {
    const { dialog } = require('electron');

    const totalSeconds = logs.reduce((sum, log) => {
        if (!log || !log.time) return sum;
        const timeParts = log.time.split(':').map(Number);
        return sum + timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    }, 0);

    const totalMinutes = totalSeconds / 60;
    const totalPoints = logs.reduce((sum, log) => sum + (log.points || 0), 0);

    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const secondsLeft = (totalSeconds % 60).toString().padStart(2, '0');
    const totalTimeLogged = `${hours}:${minutes}:${secondsLeft}`;

    const exportData = {
        summary: {
            startDate,
            endDate,
            totalTimeLogged,
            totalMinutes: parseFloat(totalMinutes.toFixed(2)),
            totalPoints,
        },
        logs: logs
    };

    const { filePath } = await dialog.showSaveDialog({
        title: 'Save Logs as JSON',
        defaultPath: path.join(app.getPath('documents'), `time-logs-${startDate}-to-${endDate}.json`),
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (filePath) {
        await fsPromises.writeFile(filePath, JSON.stringify(exportData, null, 2));
        return { success: true, message: 'Logs exported successfully!' };
    }
    return { success: false, message: 'Export cancelled.' };
});

ipcMain.handle('get-smart-templates', async () => {
    try {
        const templatesPath = path.join(__dirname, 'templates.json');
        if (fs.existsSync(templatesPath)) {
            const data = await fsPromises.readFile(templatesPath, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error("Failed to read templates.json:", error);
        return [];
    }
});