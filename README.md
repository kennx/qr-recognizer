# QR Code 识别器 (Chrome Extension MV3)

一个轻量、纯粹、基于 Chrome 扩展 Manifest V3 规范构建的二维码识别插件。通过右键点击任意网页图片，即可在右键上下文菜单中识别二维码并弹窗展示内容。

---

## 🌟 核心特性

- **纯原生技术栈**：无需编译，纯原生 JavaScript、HTML、CSS 构建，零 TypeScript 依赖。
- **Manifest V3 架构**：采用最新标准 Service Worker 作为后台运行环境，无冗余常驻进程。
- **双引擎精准解码**：
  - **引擎 1（原生加速）**：优先调用 Chromium 平台的原生 `BarcodeDetector` API（在 macOS Vision 框架、Android 及 ChromeOS 环境下具备原生性能加速）。
  - **引擎 2（离线兜底）**：内置独立 `jsQR` 库，在不支持原生条码 API 的环境或复杂图样下自动平滑降级，确保 100% 离线可用。
- **独立 Shadow DOM 弹窗**：识别结果弹窗通过 Shadow DOM 挂载，完全隔离宿主网页的 CSS 样式污染，弹窗外观永远保持统一精美。
- **贴心交互体验**：
  - 自动识别网址链接（URL）并提供「一键打开链接」快捷入口。
  - 支持「一键复制」到剪贴板。
  - 支持键盘 `Esc` 键或点击背景蒙层快速关闭。
  - 支持右键点击失败/无二维码时的友好中文提示。

---

## 📁 项目目录结构

```text
qr-recognizer/
├── manifest.json       # 扩展配置文件 (Manifest V3)
├── background.js       # 后台 Service Worker (负责菜单注册、图片解码、弹窗注入)
├── dialog.css          # 结果弹窗样式文件 (Shadow DOM 专用样式)
├── popup.html          # 工具栏点击打开的说明与本地测试面板
├── popup.css           # 弹出窗口样式
├── popup.js            # 本地图片测试拖拽识别逻辑
├── libs/
│   └── jsQR.js         # 纯 JS 离线二维码解码引擎 (兜底保障)
├── icons/              # 扩展图标 (16x16, 48x48, 128x128)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── test.html           # 专用的本地测试页面 (含多种测试图片)
└── test-images/        # 本地测试图片资源
```

---

## 🚀 安装步骤 (加载已解压的扩展程序)

1. 打开 Google Chrome 浏览器。
2. 在地址栏输入并访问：`chrome://extensions/`。
3. 打开页面右上角的 **「开发者模式」 (Developer mode)** 开关。
4. 点击左上角的 **「加载已解压的扩展程序」 (Load unpacked)** 按钮。
5. 在弹出的文件选择器中，选中当前目录：
   ```text
   /Users/kenn/PROJECTS/chrome/qr-recognizer
   ```
6. 点击确定即可完成安装！

---

## 💡 使用与测试方法

### 方式一：使用内置的测试网页
1. 在 Chrome 中直接打开本目录下的 `test.html` 文件（在 Chrome 浏览器中按 `Cmd + O` 选择 `test.html` 打开，或者直接在地址栏打开 `file:///Users/kenn/PROJECTS/chrome/qr-recognizer/test.html`）。
2. 在页面中的二维码图片上 **点击鼠标右键**。
3. 在弹出的菜单中点击 **「识别二维码」**。
4. 即可看到居中弹出的识别结果 Dialog，点击「复制内容」或「打开链接」即可。

### 方式二：在任意网页中使用
1. 访问任意包含二维码的网站（如微信网页版、公众号文章、微博、GitHub 等）。
2. 在任何二维码图片上 **点击鼠标右键**。
3. 选择 **「识别二维码」** 即可。

### 方式三：工具栏直接测试本地图片
1. 点击 Chrome 浏览器右上角扩展栏中的 **QR Code 识别器** 图标。
2. 直接拖入或点击上传电脑中的二维码图片，即可即时查看识别结果。
