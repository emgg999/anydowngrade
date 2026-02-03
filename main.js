const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setResizable(false);
  mainWindow.webContents.openDevTools()
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

//执行ADB命令，默认超时8000
function runAdbCommand(args, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const adbPath = os.platform() === 'win32' ? 'adb.exe' : 'adb';
    const adb = spawn(adbPath, args, { timeout });
    let stdout = '';
    let stderr = '';

    adb.stdout.on('data', data => stdout += data.toString());
    adb.stderr.on('data', data => stderr += data.toString());

    adb.on('error', err => reject(`ADB 启动失败: ${err.message}`));
    adb.on('timeout', () => reject('ADB 命令执行超时'));
    adb.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(`ADB 错误 (${code}): ${stderr || stdout}`);
    });
  });
}
//获取设备列表
async function getDevices() {
  try {
    const output = await runAdbCommand(['devices']);
    const lines = output.split('\n').slice(1);
    return lines
      .map(line => line.trim())
      .filter(line => line && !line.includes('*') && !line.includes('daemon'))
      .map(line => {
        const [id, status] = line.split(/\s+/);
        return { id, status: status || 'unknown' };
      });
  } catch (err) {
    throw new Error(`获取设备列表失败: ${err.message}`);
  }
}
// 设备连接（区分 USB 与网络）
async function handleDeviceClick(deviceId) {
  if (deviceId.includes(':')) {
    // 网络设备：尝试 connect
    const output = await runAdbCommand(['connect', deviceId]);
    if (output.toLowerCase().includes('connected')) {
      return { type: 'connect', message: `✅ 连接成功: ${deviceId}` };
    } else if (output.toLowerCase().includes('already connected')) {
      return { type: 'connect', message: `ℹ️ 已连接: ${deviceId}` };
    } else {
      throw new Error(output || '未知响应');
    }
  } else {
    // USB 设备：获取设备型号作为示例操作
    const model = await runAdbCommand(['-s', deviceId, 'shell', 'getprop', 'ro.product.model']);
    return {
      type: 'usb',
      message: `📱 设备型号: ${model.trim() || '未知'}`
    };
  }
}
// 获取已安装包列表
async function getInstalledPackages(deviceId) {
  const output = await runAdbCommand(['-s', deviceId, 'shell', 'cmd','package', 'list', 'packages', '-3']); // -3 = 第三方
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('package:'))
    .map(line => line.replace('package:', ''));
}

// 解析 dumpsys package 输出为结构化信息
function parsePackageInfo(rawOutput) {
  const lines = rawOutput.split('\n');
  const info = {
    packageName: '',
    versionName: '未知',
    versionCode: '未知',
    apkPath: '未知'
  };

  let inPackageSection = false;
  let inActivitySection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Package [')) {
      const packageRegex = /Package \[(.*?)\]/i
      const match = trimmed.match(packageRegex);
      if (match) {
        info.packageName = match[1];
        inPackageSection = true;
        continue;
      }
    }

    if (inPackageSection) {
      if (trimmed.startsWith('versionName=')) {
        info.versionName = trimmed.split('=')[1] || 'Unknown';
      } else if (trimmed.startsWith('versionCode=')) {
        info.versionCode = trimmed.split('=')[1] || 'Unknown';
      } else if (trimmed.startsWith('codePath=')) {
        info.apkPath = trimmed.split('=')[1] || 'Unknown';
      } else if (trimmed.startsWith('applicationLabel=')) {
        info.label = trimmed.split('=')[1] || 'Unknown';
      } else if (trimmed === '') {
        inPackageSection = false; // 包信息结束
      }
    }
    if (inActivitySection && trimmed.startsWith('name=')) {
      const name = trimmed.split('=')[1];
      if (name) {
        info.launchActivity = name;
        inActivitySection = false; // 只取第一个
      }
    }
  }

  return info;
}

// 获取包信息
async function getPackageInfo(deviceId, packageName) {
  const output = await runAdbCommand(['-s', deviceId, 'shell', 'dumpsys', 'package', packageName]);
  // console.log(output);
  return parsePackageInfo(output);
}
// 模拟：获取本地 APK 版本列表（按包名查找 ./apks/<pkg>/ 下的 .apk 文件）
function getLocalApkVersions(packageName) {
  const apkDir = path.join(__dirname, 'apks', packageName);
  if (!fs.existsSync(apkDir)) return [];
  return fs.readdirSync(apkDir)
    .filter(file => file.endsWith('.apk'))
    .map(file => ({
      versionName: file.replace('.apk', ''),
      filePath: path.join(apkDir, file)
    }));
}

//获取设备
ipcMain.handle('adb:get-devices', async () => {
  try {
    return { success: true, data: await getDevices() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
//点击设备
ipcMain.handle('adb:handle-device-click', async (event, deviceId) => {
  try {
    const result = await handleDeviceClick(deviceId);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
//获取已安装应用
ipcMain.handle('adb:get-installed-packages', async (event, deviceId) => {
  try {
    const pkgs = await getInstalledPackages(deviceId);
    return { success: true, data: pkgs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
//获取应用详情
ipcMain.handle('adb:get-package-info', async (event, deviceId, packageName) => {
  try {
    const info = await getPackageInfo(deviceId, packageName);
    return { success: true, data: info };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
//推送文件
ipcMain.handle('adb:pushFile', async (event, deviceId) => {
  // 在主进程打开文件选择框
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择文件进行推送',
    filters: [{ name: 'Files', extensions: ['*'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: '未选择文件' };
  }
  const filePath = result.filePaths[0];
  const remotePath = "/sdcard/"
  try {
    const installOut = await runAdbCommand(['-s', deviceId, 'push', filePath,remotePath],timeout=60*1000);
    return { success: true, message: '✅ 推送成功！' + installOut };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
//卸载应用
ipcMain.handle('adb:select-uninstall', async (event, deviceId, packageName) => {
  try {
    await runAdbCommand(['-s', deviceId,'shell','pm' ,'uninstall',packageName]);
    return { success: true, data: "卸载成功" };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
// 用户选择 APK 文件安装
ipcMain.handle('adb:select-and-installapk', async (event, deviceId, packageName) => {
  // 在主进程打开文件选择框
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 APK 文件进行安装',
    filters: [{ name: 'APK Files', extensions: ['apk'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: '未选择文件' };
  }
  const apkPath = result.filePaths[0];
  try {
    // 步骤2: 安装（-r 保留数据，-d 允许降级）
    const installOut = await runAdbCommand(['-s', deviceId, 'install', apkPath],timeout=60*1000);
    return { success: true, message: '✅ 安装成功！\n' + installOut };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
// 用户选择 APK 文件降级
ipcMain.handle('adb:downgrade-select-and-install', async (event, deviceId, packageName) => {
  console.log('选择 APK 文件进行降级安装'+packageName);
  // 在主进程打开文件选择框
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 APK 文件进行降级安装',
    filters: [{ name: 'APK Files', extensions: ['apk'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: '未选择文件' };
  }
  const apkPath = result.filePaths[0];
  try {
    const unInstallOut = await runAdbCommand(['-s', deviceId, 'shell', 'cmd','package','uninstall', '-k',packageName]);
    console.log('unInstallOut: ',unInstallOut);
    // 步骤2: 安装（-r 保留数据，-d 允许降级）
    const installOut = await runAdbCommand(['-s', deviceId, 'install', '-r', '-d', apkPath],timeout=60*1000);
    return { success: true, message: '✅ 降级成功！\n' + installOut };
  } catch (err) {
    return { success: false, error: err.message };
  }
});