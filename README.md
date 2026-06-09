# SCRCPY OCR 直播監控工具

## 功能概述

將 scrcpy 手機投影到電腦後，使用此工具：
- **滑鼠選取監控範圍**：拖曳選取直播留言區域
- **預覽監視畫面**：即時查看選取的區域
- **OCR 測試**：辨識繁體/簡體中文留言
- **持續監控**：定時擷取 + OCR，記錄所有留言
- **匯出 CSV**：將留言記錄匯出

## 使用步驟

### 1. 啟動 scrcpy
```bash
scrcpy
```

### 2. 啟動監控工具
```bash
cd scrcpy-ocr-monitor
npm start
```

### 3. 操作流程
1. 點「選取監控範圍」→ 拖曳選取直播留言區
2. 點「預覽監視畫面」確認範圍正確
3. 點「OCR 測試」確認能抓到中文
4. 點「開始監控」進行持續擷取

## 技術棧

| 層 | 技術 |
|---|---|
| 桌面框架 | Electron |
| UI | Vue 3 (CDN) |
| 螢幕擷取 | Electron desktopCapturer |
| OCR | Tesseract.js v5 (chi_tra+chi_sim) |
| 樣式 | 自訂 Dark Theme CSS |

## 目錄結構

```
scrcpy-ocr-monitor/
├── main.js          # Electron 主程序
├── preload.js       # 安全橋接 (contextBridge)
├── renderer/
│   ├── index.html   # UI 結構
│   ├── style.css    # Dark Theme 樣式
│   └── app.js       # Vue 3 應用邏輯
└── package.json
```

## 功能按鈕說明

| 按鈕 | 功能 |
|---|---|
| 🖱️ 選取監控範圍 | 全螢幕擷取，滑鼠拖曳選取留言區 |
| 📷 預覽監視畫面 | 擷取選取範圍並顯示 |
| 🔤 OCR 測試 | 對選取範圍執行 OCR，顯示辨識結果 |
| ▶️ 開始監控 / ⏹️ 停止監控 | 定時擷取+OCR，記錄留言 |
| 匯出 CSV | 將留言記錄匯出為 CSV 檔案 |

## 注意事項

- **Windows 限定**：Electron 需要 GUI，WSL 無法執行
- scrcpy 必須先啟動，保持手機畫面在前景
- 首次 OCR 會下載語言包 (~15MB)，需要網路
- 支援繁體中文 (chi_tra) + 簡體中文 (chi_sim)