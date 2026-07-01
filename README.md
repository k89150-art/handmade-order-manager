# 手作訂單本｜訂單管理器

給手作 / 布包賣家用的訂單管理小工具。單一 HTML 檔案，免安裝、免資料庫，用電腦跟手機都能開。

## 功能

- 訂單日期（自動帶今天，可手動改）、客人名稱
- 一筆訂單可以填多個商品品項，每項各自記錄商品名稱、布料／款式、數量、單價，並自動算小計與總金額
- 付款狀態（未付款／訂金／已付款）、製作狀態（未開始／製作中／已完成）、出貨狀態（未出貨／已出貨／面交完成）
- 交貨方式（面交／郵寄／超商店到店／其他）、備註
- 頂部統計：總訂單數、未完成訂單、未收款金額、本月營業額
- 搜尋（客人／商品／布料）＋ 三種狀態篩選
- 匯出備份 JSON、匯入備份、匯出 CSV（可用 Excel 開，方便對帳）
- 手機 / 電腦都適用的響應式版面

## ⚠️ 重要：資料存在哪裡

這個工具**沒有後端資料庫**，所有訂單資料是存在你目前這個瀏覽器的 `localStorage` 裡。也就是說：

- 換一台電腦、換手機、換瀏覽器（例如從 Chrome 換到 Safari），**都看不到之前的資料**，因為那是存在原本那個瀏覽器裡的。
- 清除瀏覽器快取／資料，也會把訂單清掉。

**建議做法：**
1. 主要固定用一個裝置＋一個瀏覽器記帳（例如手機的 Chrome）。
2. 定期按「匯出備份 (JSON)」下載備份檔，存到雲端硬碟（Google Drive、iCloud 等）。
3. 如果要在另一台裝置上接續使用，先在新裝置打開網頁，按「匯入備份」，選擇剛剛下載的 JSON 檔即可。

如果之後想要「手機跟電腦即時同步」，會需要接一個雲端資料庫（例如 Google Sheets 或 Firebase），這是進階版本，可以之後再加。

## 怎麼用 GitHub 部署成網頁（GitHub Pages，完全免費）

1. 到 [github.com](https://github.com) 註冊帳號（如果還沒有的話）。
2. 建立一個新的 Repository（右上角 `+` → `New repository`），名稱例如 `handmade-order-manager`，設為 **Public**，其他選項不用動，按 `Create repository`。
3. 進入這個新的 repository 頁面，點 `Add file` → `Upload files`，把這個資料夾裡的 `index.html`（以及這份 `README.md`）拖曳上去，按下方綠色的 `Commit changes`。
4. 上方選單點 `Settings` → 左側選單點 `Pages`。
5. 在 `Build and deployment` → `Source` 選擇 `Deploy from a branch`，Branch 選 `main`（或 `master`），資料夾選 `/ (root)`，按 `Save`。
6. 等 1～2 分鐘，重新整理這個 Pages 設定頁面，會出現一個網址，長得像：
   `https://你的帳號.github.io/handmade-order-manager/`
7. 打開這個網址，手機也用同一個網址開，就可以把它加到手機主畫面（Safari／Chrome 的「加入主畫面」），使用起來就跟 App 差不多。

之後如果要更新內容，就到 repository 裡把新的 `index.html` 上傳覆蓋過去，Commit 之後網站會自動更新（通常幾十秒內生效）。

## 檔案結構

```
handmade-order-manager/
├── index.html   ← 整個工具就這一個檔案（HTML + CSS + JS）
└── README.md    ← 這份說明
```

## 之後的規劃

你提到之後還要做「手作成本計算器」，等你準備好內容（例如想算材料費、工時、包裝費、利潤率等），可以另外開一個 `cost.html`，兩個頁面之間互相加個連結，就變成一個小小的工具站了。
