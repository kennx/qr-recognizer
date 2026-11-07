/**
 * Popup Script - Handle local QR code testing
 */

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const dropPrompt = document.getElementById('dropPrompt');
const resultBox = document.getElementById('resultBox');
const resultText = document.getElementById('resultText');
const copyResultBtn = document.getElementById('copyResultBtn');
const openLinkBtn = document.getElementById('openLinkBtn');

dropZone.addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
    fileInput.click();
  }
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleImageFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    handleImageFile(file);
  }
});

async function handleImageFile(file) {
  dropPrompt.style.display = 'none';
  resultBox.style.display = 'flex';
  resultText.textContent = '正在识别中...';
  copyResultBtn.style.display = 'none';
  openLinkBtn.style.display = 'none';

  try {
    const bitmap = await createImageBitmap(file);

    // 1. 优先尝试 BarcodeDetector
    let decodedText = null;
    if ('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const codes = await detector.detect(bitmap);
        if (codes && codes.length > 0) {
          decodedText = codes[0].rawValue;
        }
      } catch (e) {
        console.warn('BarcodeDetector error:', e);
      }
    }

    // 2. 兜底尝试 jsQR
    if (!decodedText && typeof jsQR !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const qrRes = jsQR(imgData.data, imgData.width, imgData.height);
      if (qrRes && qrRes.data) {
        decodedText = qrRes.data;
      }
    }

    if (decodedText) {
      resultText.textContent = decodedText;
      copyResultBtn.style.display = 'inline-flex';

      const isUrl = /^https?:\/\//i.test(decodedText.trim());
      if (isUrl) {
        openLinkBtn.style.display = 'inline-flex';
        openLinkBtn.href = decodedText.trim();
      }
    } else {
      resultText.textContent = '❌ 未识别到有效二维码';
    }
  } catch (err) {
    resultText.textContent = '❌ 解析失败: ' + err.message;
  }
}

copyResultBtn.addEventListener('click', () => {
  const text = resultText.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const old = copyResultBtn.textContent;
    copyResultBtn.textContent = '已复制!';
    setTimeout(() => {
      copyResultBtn.textContent = old;
    }, 1500);
  });
});
