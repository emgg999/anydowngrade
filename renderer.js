const deviceList = document.querySelector('#deviceList tbody');
const refreshBtn = document.getElementById('refreshBtn');
const loadingOverlay = document.getElementById('loadingOverlay');

let isLoading = false;
// ====== 新增全局状态 ======
let selectedDevice = null;

let downgradeAppPackageName = null

// ===== 新增：Toast 提示 =====
function showToast(message, type = 'success') {
  const toastContainer = document.getElementById('toastContainer');
  const toastMessage = document.getElementById('toastMessage');

  // 设置样式
  if (type === 'success') {
    toastMessage.style.backgroundColor = 'rgba(82, 196, 26, 0.75)'; // 绿色
  } else if (type === 'error') {
    toastMessage.style.backgroundColor = 'rgba(255, 77, 79, 0.75)'; // 红色
  } else {
    toastMessage.style.backgroundColor = 'rgba(24, 144, 255,0.75)'; // 蓝色（info）
  }

  // 显示内容
  toastMessage.textContent = message;
  toastContainer.style.opacity = '1';
  toastContainer.style.display = 'block';
  toastMessage.style.opacity = '1';
  toastMessage.style.display = 'block';

  // 清除之前的定时器（关键！）
  if (toastContainer.toastTimer) {
    clearTimeout(toastContainer.toastTimer);
  }
  // 创建新的定时器（绑定到 container 避免全局污染）
  toastContainer.toastTimer = setTimeout(() => {
    hideToast();
  }, 1500);
  // 点击立即关闭
  const onClickClose = () => {
    hideToast();
    toastMessage.removeEventListener('click', onClickClose);
  };
  toastMessage.addEventListener('click', onClickClose);
}
function hideToast() {
  console.log('hideToast');
  const toastMessage = document.getElementById('toastMessage');
  const container = document.getElementById('toastContainer');
  container.style.opacity = '0';
  toastMessage.style.opacity = '0';
  // 延迟隐藏 display，让淡出动画完成
  setTimeout(() => {
    container.style.display = 'none';
    toastMessage.style.display = 'none';
  }, 300);
}
// 渲染应用列表
function renderAppList(packages) {
  const tbody = document.querySelector('#appListBody tbody');
  tbody.innerHTML = '';
  if (packages.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="2" style="padding:12px; text-align:center; color:#999;">📭 未找到第三方应用</td>`;
    tbody.appendChild(tr);
    return;
  }
  packages.forEach(pkg => {
    const tr = document.createElement('tr');
    // 鼠标悬停高亮（可选）
    tr.style.transition = 'background 0.2s';
    tr.onmouseenter = () => tr.style.background = '#fafafa';
    tr.onmouseleave = () => tr.style.background = '';
    tr.innerHTML = `
      <td style="padding:10px; border-top:1px solid #eee;">${pkg}</td>
      <td style="padding:10px; border-top:1px solid #eee;">
        <button class="btn-detail" data-pkg="${pkg}" style="margin-right:8px;">详情</button>
        <button class="btn-downgrade" data-pkg="${pkg}">降级</button>
        <button class="btn-uninstall" data-pkg="${pkg}">卸载</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  // 绑定列表按钮点击事件
  tbody.querySelectorAll('.btn-detail').forEach(btn => {
    btn.addEventListener('click', (e) => showPackageInfo(e.target.dataset.pkg));
  });
  tbody.querySelectorAll('.btn-downgrade').forEach(btn => {
    btn.addEventListener('click', (e) => downgradeApp(e.target.dataset.pkg));
  });
  tbody.querySelectorAll('.btn-uninstall').forEach(btn => {
    btn.addEventListener('click', (e) => uninstallApp(e.target.dataset.pkg));
  });
}

// 绑定主界面按钮点击事件
document.getElementById('pushBtn').addEventListener('click', pushFile);
document.getElementById('installApkBtn').addEventListener('click', installApkGlobally);
document.getElementById('refreshBtn').addEventListener('click', installApkGlobally);

// 安装 APK
async function installApkGlobally() {
  if (!selectedDevice) {
    showToast('⚠️ 请先选择一个设备', 'error');
    return;
  }

  setLoading(true);
  try {
    // 复用已有的 IPC 方法
    const res = await window.adbAPI.installAppByFile(selectedDevice.id);
    if (res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(`❌ 安装失败: ${res.error}`, 'error');
    }
  } finally {
    setLoading(false);
  }
}
//推送文件到设备
async function pushFile() {
  if (!selectedDevice) {
    showToast('⚠️ 请先选择一个设备', 'error');
    return;
  }
  setLoading(true);
  try {
    // 复用已有的 IPC 方法
    const res = await window.adbAPI.pushFile(selectedDevice.id);
    if (res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(`❌ 推送失败: ${res.error}`, 'error');
    }
  } finally {
    setLoading(false);
  }
}
//展示应用详细信息
async function showPackageInfo(packageName) {
  if (isLoading) return;
  setLoading(true);
  try {
    const res = await window.adbAPI.getPackageInfo(selectedDevice.id, packageName);
    if (res.success) {
      const data = res.data;
      // 构建表格 HTML
      const tableHtml = `
        <table style="width:100%; border-collapse: collapse; margin-top:10px;">
          <tr><td style="padding:8px; background:#f5f5f5;">包名</td><td style="padding:8px;">${data.packageName}</td></tr>
          <tr><td style="padding:8px; background:#f5f5f5;">路径</td><td style="padding:8px; word-break:break-all;">${data.apkPath}</td></tr>
          <tr><td style="padding:8px; background:#f5f5f5;">版本</td><td style="padding:8px;">${data.versionName} (Code: ${data.versionCode})</td></tr>
        </table>
      `;
      showModal(`应用详情 - ${packageName}`, tableHtml);
    } else {
      showToast(`❌ 获取详情失败: ${res.error}`, 'error');
    }
  } finally {
    setLoading(false);
  }
}
// 卸载应用
async function uninstallApp(packageName) {
  if (isLoading) return;
  // 提示用户即将降级哪个应用
  if (!confirm(`确定要卸载【${packageName}】吗？`)) {
    return;
  }
  setLoading(true);
  try {
    const res = await window.adbAPI.uninstallApp(selectedDevice.id, packageName);
    if (res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(`❌ 卸载失败: ${res.error}`, 'error');
    }
  } finally {
    setLoading(false);
  }
}
// 降级函数：直接触发文件选择 + 安装
async function downgradeApp(packageName) {
  if (isLoading) return;
  // 提示用户即将降级哪个应用
  if (!confirm(`确定要为【${packageName}】安装新 APK 吗？\n请选择 .apk 文件进行降级安装。`)) {
    return;
  }
  setLoading(true);
  try {
    console.log('降级开始' + packageName);
    const res = await window.adbAPI.downgradeAppByFile(selectedDevice.id, packageName);
    if (res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(`❌ 安装失败: ${res.error}`, 'error');
    }
  } finally {
    setLoading(false);
  }
}
// 通用弹窗
function showModal(title, content, onShowCallback = null) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalContent').innerHTML = content;
  document.getElementById('modal').style.display = 'flex';

  if (onShowCallback) onShowCallback();

  document.getElementById('modalCloseBtn').onclick = hideModal;
  document.getElementById('modal').onclick = (e) => {
    if (e.target.id === 'modal') hideModal();
  };
}

function hideModal() {
  document.getElementById('modal').style.display = 'none';
}


function setLoading(loading) {
  isLoading = loading;
  loadingOverlay.style.display = loading ? 'flex' : 'none';
  refreshBtn.disabled = loading;
}

function renderDevices(devices) {
  deviceList.innerHTML = '';
  if (devices.length === 0) {
    deviceList.innerHTML = `<tr><td colspan="2" style="text-align:center;color:#999">📭 未检测到设备</td></tr>`;
    return;
  }
  devices.forEach(device => {
    const tr = document.createElement('tr');
    if (device.status !== 'device') tr.classList.add('offline');
    tr.innerHTML = `<td>${device.id}</td><td>${device.status}</td>`;
    tr.addEventListener('click', () => handleDeviceClick(device.id));
    deviceList.appendChild(tr);
  });
}

async function loadDevices() {
  if (isLoading) return;
  setLoading(true);
  document.getElementById('selectedDeviceId').textContent = "";
  document.getElementById('appListContainer').style.display = 'none';
  // 重置选中状态
  selectedDevice = null;
  try {
    const res = await window.adbAPI.getDevices();
    if (res.success) {
      renderDevices(res.data);
      showToast(`✅ 已加载 ${res.data.length} 个设备`, 'success');
    } else {
      throw new Error(res.error);
    }
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
    renderDevices([]);
  } finally {
    setLoading(false);
  }
}

async function handleDeviceClick(deviceId) {
  if (isLoading) return;
  setLoading(true);
  document.getElementById('selectedDeviceId').textContent = "";
  document.getElementById('appListContainer').style.display = 'none';
  try {
    const res = await window.adbAPI.handleDeviceClick(deviceId);
    if (res.success) {
      showToast(res.message, 'success');
      // 记录选中设备
      selectedDevice = { id: deviceId, status: 'device' };
      // ✅ 启用全局按钮
      document.getElementById('installApkBtn').disabled = false;
      document.getElementById('pushBtn').disabled = false;
      document.getElementById('selectedDeviceId').textContent = deviceId;
      document.getElementById('appListContainer').style.display = 'block';
      // 加载应用列表
      const pkgRes = await window.adbAPI.getInstalledPackages(deviceId);
      if (pkgRes.success) {
        renderAppList(pkgRes.data);
      } else {
        showToast(`⚠️ 加载应用失败: ${pkgRes.error}`, 'error');
        document.getElementById('appListContainer').style.display = 'none';
      }
    } else {
      showToast(`❌ ${res.error}`, 'error');
    }
  } catch (err) {
    showToast(`❌ 操作失败: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

refreshBtn.addEventListener('click', loadDevices);

// 初始加载
loadDevices();