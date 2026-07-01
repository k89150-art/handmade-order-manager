[Uploading README.md…]()
# 手作工具箱：訂單管理器 + 成本計算器

給手作 / 布包賣家用的小工具，兩個頁面共用同一套設計，靠上方的導覽連結互相切換。現在已接上 Firebase Firestore，可以讓不同裝置共用同一份訂單與成本資料。

## 一、訂單管理器（index.html）

- 訂單日期（自動帶今天，可手動改）、客人名稱
- 一筆訂單可以填多個商品品項，每項各自記錄商品名稱、布料／款式、數量、單價，並自動算小計與總金額
- 付款狀態（未付款／訂金／已付款）、製作狀態（未開始／製作中／已完成）、出貨狀態（未出貨／已出貨／面交完成）
- 交貨方式（面交／郵寄／超商店到店／其他）、備註
- 頂部統計：總訂單數、未完成訂單、未收款金額、本月營業額
- 搜尋（客人／商品／布料）＋ 三種狀態篩選

## 二、成本計算器（cost.html）

- 一個商品可以填多項材料（材料名稱、單位、用量、單價），自動算材料費小計
- 工時成本（工時 × 時薪）、包材費、其他成本，自動加總成本總計
- **三種定價方式都會一起算出來給你比較**，用單選鈕決定哪一種當作「主要建議售價」：
  - **加成倍率**：成本 × 你設定的倍率（例如 ×1.5）
  - **目標毛利率**：抓一個希望的毛利率（例如售價的 40% 是利潤），反推售價
  - **指定利潤金額**：直接設定「這件想賺多少錢」，加在成本上面
  - 三種方式的參數都會保留，隨時可以切換，不會遺失你填過的數字
- 可以填平台／通路手續費（例如蝦皮、露天），會自動算出「扣手續費後的實際利潤」跟「實際毛利率」
- 頂部統計：已建立商品數、平均建議售價、平均實際毛利率、平均單件利潤
- 每個商品的成本表都會存下來，之後可以搜尋、編輯

## 兩個工具共用的功能

- 資料會同步到 Firebase Firestore，並在瀏覽器 localStorage 保留快取
- 匯出備份 JSON、匯入備份、匯出 CSV（可用 Excel 開，方便對帳／記帳）
- 手機 / 電腦都適用的響應式版面
- 上方導覽連結：訂單管理器 ↔ 成本計算器，一鍵互相切換

## Firebase 後端資料庫

目前使用 Firebase 專案：

```js
projectId: "handmade-order-c3fc0"
```

資料會同步到 Firestore：

- `orders`：訂單管理器資料
- `costSheets`：成本計算器資料

前端仍會保留一份 localStorage 快取。Firestore 暫時連不上時，畫面仍可讀取瀏覽器本機資料；下一次儲存時會再嘗試同步到雲端。

### Firebase Console 需要開啟

1. 建立 / 啟用 Firestore Database。
2. 到 Authentication 啟用 `Anonymous` 匿名登入。
3. 部署 `firestore.rules`，讓已登入的匿名使用者可以讀寫資料。

### Firebase CLI 部署

```bash
firebase login
firebase use handmade-order-c3fc0
firebase deploy
```

## ⚠️ 重要：資料存在哪裡

這兩個工具已經接上 Firestore 後端資料庫，同時也會在你目前這個瀏覽器的 `localStorage` 裡保留快取。訂單資料跟成本表資料是分開存的，互不影響。也就是說：

- 換一台電腦、換手機、換瀏覽器，只要能連到同一個 Firebase 專案，就會讀到 Firestore 裡的資料。
- 清除瀏覽器快取／資料，只會清掉本機快取；Firestore 裡的雲端資料不會因此刪除。
- 如果 Firestore 或登入設定沒有啟用，工具會退回使用 localStorage，這時就只剩本機資料。

**建議做法：**
1. 先確認 Firebase Console 已啟用 Firestore Database 和 Anonymous Authentication。
2. 定期在兩個頁面都按「匯出備份 (JSON)」下載備份檔，作為人工備份。
3. 如果有舊的 localStorage 備份，可以用「匯入備份」匯入；下一次儲存會同步到 Firestore。

## 怎麼用 GitHub 部署成網頁（GitHub Pages，完全免費）

1. 到 [github.com](https://github.com) 註冊帳號（如果還沒有的話）。
2. 建立一個新的 Repository（右上角 `+` → `New repository`），名稱例如 `handmade-order-manager`，設為 **Public**，其他選項不用動，按 `Create repository`。
3. 進入這個新的 repository 頁面，點 `Add file` → `Upload files`，把這個資料夾裡**全部檔案**（`index.html`、`cost.html`、`style.css`、`script.js`、`cost.js`、`README.md`）一次拖曳上去，按下方綠色的 `Commit changes`。
4. 上方選單點 `Settings` → 左側選單點 `Pages`。
5. 在 `Build and deployment` → `Source` 選擇 `Deploy from a branch`，Branch 選 `main`（或 `master`），資料夾選 `/ (root)`，按 `Save`。
6. 等 1～2 分鐘，重新整理這個 Pages 設定頁面，會出現一個網址，長得像：
   `https://你的帳號.github.io/handmade-order-manager/`
7. 打開這個網址就是訂單管理器；網址後面加 `cost.html`（例如 `https://你的帳號.github.io/handmade-order-manager/cost.html`）就是成本計算器，兩頁互相都有連結可以切換。手機也用同一個網址開，可以加到主畫面（Safari／Chrome 的「加入主畫面」），使用起來就跟 App 差不多。

之後如果要更新內容，就到 repository 裡把新的檔案上傳覆蓋過去，Commit 之後網站會自動更新（通常幾十秒內生效）。

## 檔案結構

```
handmade-order-manager/
├── index.html   ← 訂單管理器（HTML 結構）
├── cost.html    ← 成本計算器（HTML 結構）
├── style.css    ← 兩個頁面共用的外觀樣式（CSS）
├── script.js    ← 訂單管理器的功能邏輯（JS）
├── cost.js      ← 成本計算器的功能邏輯（JS）
└── README.md    ← 這份說明
```

上傳到 GitHub 時，這幾個檔案要放在**同一層資料夾**（不要放進子資料夾），因為 HTML 檔裡是用相對路徑（`href="style.css"`、`src="script.js"` 等）去找其他檔案，路徑對不上網頁就會變成沒有樣式、沒有功能的空白畫面。

