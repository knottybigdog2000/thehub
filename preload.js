
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openInputWindow: (timeToSave) => ipcRenderer.invoke('open-input-window', timeToSave),
    saveTime: (logData) => ipcRenderer.invoke('save-time', logData),
    saveCmf: (data) => ipcRenderer.send('save-cmf', data),
    getTimeLogs: () => ipcRenderer.invoke('get-time-logs'),
    getUsername: () => ipcRenderer.invoke('get-username'),
    deleteTimeLog: (logId) => ipcRenderer.invoke('delete-time-log', logId),
    updateTimeLog: (newLogData) => ipcRenderer.invoke('update-time-log', newLogData),
    exportLogsJson: (logs) => ipcRenderer.invoke('export-logs-json', logs),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    onGlobalShortcut: (callback) => ipcRenderer.on('global-shortcut', callback),
    onCmfSaved: (callback) => ipcRenderer.on('cmf-saved-successfully', callback),
    onLogsUpdated: (callback) => ipcRenderer.on('logs-updated', callback),
    getSmartTemplates: () => ipcRenderer.invoke('get-smart-templates'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
    onUpdateLog: (callback) => ipcRenderer.on('update-log', (_event, value) => callback(value)),
    setLoginItemSettings: (settings) => ipcRenderer.invoke('set-login-item-settings', settings),
});
