/**
 * QR Code Recognizer - Background Service Worker (Manifest V3)
 */

// 引入纯 JS 二维码解码库 (离线兜底方案)
importScripts('libs/jsQR.js');

// 1. 扩展安装或更新时注册右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'recognize-qr-menu',
    title: '识别二维码',
    contexts: ['image']
  });
});

// 2. 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'recognize-qr-menu') return;

  const tabId = tab?.id;
  if (!tabId) {
    console.error('未获取到有效的标签页 ID');
    return;
  }

  const srcUrl = info.srcUrl;
  if (!srcUrl) {
    await injectDialog(tabId, { success: false, error: '未获取到所选图片的 URL 地址' });
    return;
  }

  // 识别二维码
  const result = await decodeQRCode(srcUrl, tabId);

  // 在当前页面弹窗显示结果
  await injectDialog(tabId, result);
});

/**
 * 二维码核心识别逻辑
 * 策略: 优先使用 Chrome 原生 BarcodeDetector (高速度、系统级硬件/算法加速)
 * 兜底: 降级到 jsQR (100% 纯 JS 离线兼容)
 */
async function decodeQRCode(srcUrl, tabId) {
  try {
    let blob;

    try {
      // 依靠 MV3 host_permissions: ["<all_urls>"] 绕过页面 CORS 限制直接拉取图片
      const res = await fetch(srcUrl);
      if (!res.ok) throw new Error(`HTTP 状态码: ${res.status}`);
      blob = await res.blob();
    } catch (fetchErr) {
      // 针对部分特殊 blob: URL 或内网受限资源，尝试在网页 DOM 中提取数据
      if (tabId) {
        const pageDataUrl = await extractImageFromPage(tabId, srcUrl);
        if (pageDataUrl) {
          const res = await fetch(pageDataUrl);
          blob = await res.blob();
        }
      }
      if (!blob) {
        throw new Error('无法读取该图片数据，可能受网络或跨域保护限制');
      }
    }

    const bitmap = await createImageBitmap(blob);

    // 方案 1: 原生 BarcodeDetector API (macOS / Android / ChromeOS 原生内置)
    if ('BarcodeDetector' in self) {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await detector.detect(bitmap);
        if (barcodes && barcodes.length > 0) {
          return {
            success: true,
            text: barcodes[0].rawValue,
            source: 'native'
          };
        }
      } catch (detectorErr) {
        console.warn('BarcodeDetector 识别未命中或异常，正在使用 jsQR 兜底:', detectorErr);
      }
    }

    // 方案 2: jsQR + OffscreenCanvas 离线降级
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const qrResult = jsQR(imgData.data, imgData.width, imgData.height);

    if (qrResult && qrResult.data) {
      return {
        success: true,
        text: qrResult.data,
        source: 'jsqr'
      };
    }

    return {
      success: false,
      error: '未在图片中检测到有效的二维码'
    };
  } catch (error) {
    console.error('识别二维码发生错误:', error);
    return {
      success: false,
      error: error.message || '识别二维码失败'
    };
  }
}

/**
 * 如果 Service Worker 无法直接 fetch (例如页面内部 blob URL)，
 * 在页面环境中寻找对应的 img 元素并转为 Base64 DataURL
 */
async function extractImageFromPage(tabId, targetSrc) {
  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (src) => {
        const img = Array.from(document.querySelectorAll('img')).find(el => el.src === src);
        if (!img) return null;
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          return c.toDataURL('image/png');
        } catch (e) {
          return null;
        }
      },
      args: [targetSrc]
    });
    return execution?.result || null;
  } catch (e) {
    return null;
  }
}

/**
 * 注入并弹出识别结果弹窗
 */
async function injectDialog(tabId, result) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderQRDialog,
      args: [result]
    });
  } catch (err) {
    console.error('无法在页面注入弹窗 (可能是 chrome:// 系统内置页或受限页面):', err);
  }
}

/**
 * 在目标网页中创建隔离的 Shadow DOM 弹窗
 * (此函数将被序列化并在目标页面上下文中执行)
 */
function renderQRDialog(result) {
  const ROOT_ID = 'qr-recognizer-extension-root';

  // 1. 若已有弹窗，先移除旧实例
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    existing.remove();
  }

  // 2. 创建独立宿主元素并开启 Shadow DOM，完全隔离宿主页面的 CSS
  const host = document.createElement('div');
  host.id = ROOT_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  // 3. 引入样式表
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('dialog.css');
  shadow.appendChild(link);

  // 4. 构建弹窗 DOM
  const overlay = document.createElement('div');
  overlay.className = 'qr-overlay';

  const card = document.createElement('div');
  card.className = 'qr-card';

  // 判断是否为 URL 链接
  const isUrl = result.success && /^https?:\/\//i.test(result.text.trim());

  // 头部
  const header = document.createElement('div');
  header.className = 'qr-header';
  header.innerHTML = `
    <div class="qr-title-box">
      <div class="qr-icon-badge ${result.success ? '' : 'error'}">
        ${result.success
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        }
      </div>
      <span class="qr-title">${result.success ? '二维码识别结果' : '识别失败'}</span>
    </div>
    <button class="qr-close-btn" title="关闭 (Esc)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  // 内容主体
  const body = document.createElement('div');
  body.className = 'qr-body';

  if (result.success) {
    if (isUrl) {
      const tagRow = document.createElement('div');
      tagRow.className = 'qr-tag-row';
      tagRow.innerHTML = `
        <span class="qr-tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          网址链接
        </span>
      `;
      body.appendChild(tagRow);
    }

    const textBox = document.createElement('div');
    textBox.className = 'qr-text-box';
    textBox.textContent = result.text;
    body.appendChild(textBox);
  } else {
    const errorBox = document.createElement('div');
    errorBox.className = 'qr-error-msg';
    errorBox.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>
        <strong>${result.error || '未识别到二维码'}</strong>
        <div class="qr-error-tip">请确保选中的图片完整、清晰且包含可识别的二维码图案。</div>
      </div>
    `;
    body.appendChild(errorBox);
  }

  // 底部按钮
  const footer = document.createElement('div');
  footer.className = 'qr-footer';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'qr-btn qr-btn-secondary';
  closeBtn.textContent = '关闭';

  footer.appendChild(closeBtn);

  if (result.success) {
    // 复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'qr-btn qr-btn-primary';
    copyBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      复制内容
    `;
    copyBtn.addEventListener('click', () => {
      const textToCopy = result.text;
      const doSuccess = () => {
        copyBtn.textContent = '已复制 ✓';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            复制内容
          `;
          copyBtn.classList.remove('copied');
        }, 2000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(doSuccess).catch(() => {
          fallbackCopyText(textToCopy, doSuccess);
        });
      } else {
        fallbackCopyText(textToCopy, doSuccess);
      }
    });

    footer.appendChild(copyBtn);

    // 如果是网址链接，提供快速打开按钮
    if (isUrl) {
      const openBtn = document.createElement('a');
      openBtn.className = 'qr-btn qr-btn-primary';
      openBtn.href = result.text.trim();
      openBtn.target = '_blank';
      openBtn.rel = 'noopener noreferrer';
      openBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        打开链接
      `;
      footer.appendChild(openBtn);
    }
  }

  // 组装结构
  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  shadow.appendChild(overlay);

  // 挂载到主页面
  (document.body || document.documentElement).appendChild(host);

  // 关闭逻辑处理
  function closeModal() {
    overlay.classList.add('closing');
    window.removeEventListener('keydown', handleKeydown);
    setTimeout(() => {
      host.remove();
    }, 180);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }

  // 点击关闭按钮
  header.querySelector('.qr-close-btn').addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);

  // 点击蒙层背景关闭 (不影响点击卡片内部)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // 按 Esc 键关闭
  window.addEventListener('keydown', handleKeydown);

  // 兜底文本复制方案
  function fallbackCopyText(text, callback) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (callback) callback();
    } catch (e) {
      console.warn('execCommand copy failed', e);
    }
    ta.remove();
  }
}
