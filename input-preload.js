const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('inputAPI', {
    onTimeData: (callback) => ipcRenderer.on('time-data', callback),
    saveLog: (logData) => ipcRenderer.send('save-log-from-input-window', logData),
    resizeWindow: (height) => ipcRenderer.send('resize-input-window', height),
});
