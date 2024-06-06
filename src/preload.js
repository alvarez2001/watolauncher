const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    launchMinecraft: () => ipcRenderer.send('launch-minecraft'),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    onLaunchSuccess: (callback) => ipcRenderer.on('launch-success', (event, message) => callback(message)),
    onLaunchError: (callback) => ipcRenderer.on('launch-error', (event, error) => callback(error)),
    onLoading: (callback) => ipcRenderer.on('loading', (event, message) => callback(message)),
    onLoadingComplete: (callback) => ipcRenderer.on('loading-complete', () => callback())
});
