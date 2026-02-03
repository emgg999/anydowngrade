const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adbAPI', {
    getDevices: () => ipcRenderer.invoke('adb:get-devices'),
    connectDevice: (deviceId) => ipcRenderer.invoke('adb:connect-device', deviceId),
    onDeviceListUpdate: (callback) => ipcRenderer.on('adb:device-list-updated', callback),
    handleDeviceClick: (deviceId) => ipcRenderer.invoke('adb:handle-device-click', deviceId),
    getInstalledPackages: (deviceId) => ipcRenderer.invoke('adb:get-installed-packages', deviceId),
    getPackageInfo: (deviceId, pkg) => ipcRenderer.invoke('adb:get-package-info', deviceId, pkg),
    downgradeAppByFile: (deviceId,pkg) => ipcRenderer.invoke('adb:downgrade-select-and-install', deviceId,pkg),
    uninstallApp: (deviceId,pkg) => ipcRenderer.invoke('adb:select-uninstall', deviceId,pkg),
    installAppByFile: (deviceId) => ipcRenderer.invoke('adb:select-and-installapk', deviceId),
    pushFile: (deviceId) => ipcRenderer.invoke('adb:pushFile', deviceId)
});