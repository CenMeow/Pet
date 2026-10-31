# TSB 巨集編輯器

用「步驟卡片」製作 The Strongest Battlegrounds（Roblox）技巧巨集的桌面程式。
不用會寫 AutoHotkey：排好按鍵、等待、轉視角等步驟，編輯器會產生 AutoHotkey v2 腳本並幫你執行。

## 功能

- 巨集清單：每個巨集有自己的觸發鍵，可以個別開關
- 步驟卡片：按一下（可設定按住時長）、按住、放開、等待（毫秒，附 60 FPS 格數換算）、轉視角（角度，自動依靈敏度換算）、滑鼠移到座標、封鎖輸入（鍵盤／滑鼠／全部）；可拖曳排序
- 內建範本：Backdash cancel、Emote backdash、Twist tech、Lethal dash、Side front dash、Super jump、True downslam
- 匯入 `.mgp` 巨集檔，以及本程式匯出的 `.json`
- 一鍵執行／停止，或匯出成 `.ahk` 自己用
- 預設只在 Roblox 視窗在前景時觸發；F2 開關全部巨集、F1 結束（可在設定修改）
- 產生的腳本使用高精度計時（QueryPerformanceCounter）和相對滑鼠移動（shift lock 下也能轉視角）

## 安裝

1. 安裝 [AutoHotkey v2](https://www.autohotkey.com/)（免費）。
2. 到 GitHub 的 **Actions** 頁面，打開最新一次成功的 Build，下載 `tsb-macro-editor-windows`，解壓後執行安裝檔。
   推送 `v0.1.0` 這類 tag 時，也會自動產生 Release 草稿。

## 開發

需要 Node.js 22 和 Rust（stable）。

```bash
npm install
npm run dev          # 只開網頁介面（瀏覽器預覽，不能執行腳本）
npm run tauri dev    # 開桌面版（Windows）
npm test             # 腳本產生器、.mgp 匯入等單元測試
npm run tauri build  # 打包安裝檔
```

主要程式碼：

- `src/lib/generator.ts`：巨集 → AutoHotkey v2 腳本，以及錯誤檢查
- `src/lib/templates.ts`：技巧範本
- `src/lib/mgp.ts`：`.mgp` 匯入
- `src-tauri/src/lib.rs`：尋找 AutoHotkey、執行／停止腳本、讀寫檔案

## 注意

AHK 只是模擬鍵盤滑鼠，一般不會被 Roblox 反作弊當成外掛，但遊戲或社群規則仍可能禁止巨集或利用 bug，被檢舉可能遭到處罰。請自行評估，建議在私人伺服器練習。

範本的時間數值參考社群腳本 Jaharia TSB Macro（作者 Sedz），遊戲更新或電腦延遲不同時需要自己微調。
