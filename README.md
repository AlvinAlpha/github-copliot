# 王國守衛者 — Kingdom Defender

一款使用 React、TypeScript、Phaser 3、Tailwind CSS 與 Zustand 製作的奇幻塔防遊戲。遊戲畫面與角色皆以程式繪製，沒有使用未授權的美術素材。

## 安裝與啟動

需求：Node.js 20 或更新版本，以及 npm。

Windows 使用者也可直接雙擊 [`START_GAME.cmd`](./START_GAME.cmd) 啟動；若尚未安裝 Node.js，啟動檔會下載免安裝版本，並自動安裝遊戲依賴、啟動伺服器及開啟瀏覽器。首次啟動需要網路連線。

```bash
npm install
npm run dev
```

在終端機顯示的網址開啟遊戲（通常是 `http://localhost:5173`）。正式建置與本機預覽：

```bash
npm run build
npm run preview
```

## 遊戲操作

- 在主畫面按「開始守衛」開始。選擇地圖上的建塔位置，使用金幣建造弓箭塔、法師塔、砲塔或兵營。
- 點選已建造的塔可查看射程、升級或出售；出售會返還總花費的 60%。
- 點擊地圖移動英雄；流星火雨可在地圖選擇目標，援軍會在英雄所在位置加入戰鬥。
- 波次間可提前召喚敵人。支援暫停與 1x／2x 速度切換；敵人抵達城堡會扣除生命。
- 進度與音效設定儲存在此瀏覽器的 LocalStorage。

## GitHub 上傳

在 GitHub 建立空白 repository，然後在專案資料夾執行（將網址換成自己的 repository）：

```bash
git init
git add .
git commit -m "建立王國守衛者塔防遊戲"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<repository>.git
git push -u origin main
```

## Vercel 部署

1. 將專案推送至 GitHub。
2. 登入 [Vercel](https://vercel.com/)，選擇 **Add New → Project** 並匯入該 repository。
3. Framework Preset 選 **Vite**；Build Command 為 `npm run build`，Output Directory 為 `dist`。這些設定已寫入 `vercel.json`，匯入後可直接採用。本專案沒有環境變數或後端設定。
4. 按 **Deploy**。之後推送到 `main` 會自動觸發正式部署，其他分支則建立預覽部署。

若使用 Vercel CLI，也可在專案目錄執行：

```bash
npm install -g vercel
vercel
vercel --prod
```
