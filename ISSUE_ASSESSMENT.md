# 問題評估紀錄

本文件用來記錄目前已驗證到的問題，避免後續在沒有證據的情況下胡亂修改。

時間歸類規則：

- 剛剛做的：以本機時區 `Asia/Taipei` 的 `2026-05-03` 為準，只要是今天發生或今天引入的問題，都歸在這類。
- 之前做的：在 `2026-05-03` 之前的版本就已存在的問題。

已參考的 git 節點：

- `84c8ca0`，`2026-05-03 00:26:58 +0800`，修正 popup 下拉與還原流程。
- `b77fd1b`，`2026-05-03 00:17:17 +0800`，修正背景同步與 tab 狀態追蹤。
- `a7528f3`，`2026-05-03 00:08:57 +0800`，前一版全域靜音與 service worker 修正。
- `946e262`，`2025-04-25 19:22:58 +0800`，今天以前的 UI 樣式版本。

## 問題列表

| 發生什麼問題 | 找證據的方式：明確指出為什麼這樣做不行 | 使用者的感受 | 時間歸類 |
| --- | --- | --- | --- |
| popup 開啟時，「全域靜音」開關沒有反映 storage 裡的真實狀態。 | 在 `946e262:popup.js` 與 `a7528f3:popup.js` 中，`loadStoredState()` 只把 `storage.isAllMuted` 寫入 JS 變數，沒有同步到 `globalMuteToggle.checked`。因此 storage 已經是全域靜音時，畫面仍可能顯示開關關閉。後續在 `b77fd1b` 補上 `globalMuteToggle.checked = isAllMuted`。 | 有感。使用者會看到 UI 狀態與實際靜音狀態不一致，容易以為功能壞掉或被初始化重置。 | 之前做的。`946e262` 已存在，並非今天才引入。 |
| 使用者解除某個已追蹤分頁靜音時，background 可能立刻把它打回靜音。 | 在 `946e262:popup.js` 與 `a7528f3:popup.js` 的 `handleCurrentTabMute()` / `handleSelectedTabMute()` 中，流程是先 `chrome.tabs.update(..., { muted: false })`，之後才更新 `mutedTabIds` / `isAllMuted` 到 storage。background 的 `tabs.onUpdated` 會在 `mutedInfo.muted === false` 時檢查舊的追蹤清單，如果 tabId 還在清單內，就會重新 `chrome.tabs.update(..., { muted: true })`。這是實際呼叫順序造成的 race，不是猜測。`b77fd1b` 已改成先同步使用者意圖到 storage，再更新 tab。 | 高度有感。使用者點了取消靜音，畫面或實際音訊卻又被自動靜音，會覺得按鈕失效。 | 之前做的。今天以前的版本已存在這個順序問題；今天只是被背景監控邏輯更明顯地暴露。 |
| 今天的背景重構後，多個新分頁同時建立時，`mutedTabIds` 有機會互相覆蓋。 | `a7528f3:background.js` 的 `onCreated` 會在每個事件中各自 `getState()`，新增一個 tabId，最後整包 `saveMutedTabIds()`。若兩個 `onCreated` 同時讀到同一份舊資料，最後寫入者會覆蓋前一個事件新增的 tabId。已用 mock Chrome API 驗證兩個 `onCreated.fire({ id: 1 })` / `onCreated.fire({ id: 2 })` 並行時需要序列化更新；`b77fd1b` 新增 `updateMutedTabIds()` 來排隊處理。 | 當下不一定有感，屬於累積型問題。使用者開很多分頁後，某些分頁可能沒有被納入強制靜音追蹤，之後跳轉或解除靜音時才發現狀態不穩。 | 剛剛做的。這個具體 lost update 風險來自 `2026-05-03` 的 `a7528f3` 背景重構。 |
| Chrome 因 prerender / instant 把 tab 換成新 tabId 時，原本的靜音追蹤不會移轉。 | Chrome tabs API 有 `tabs.onReplaced(addedTabId, removedTabId)`，表示分頁可能被新 tabId 取代。今天以前的 `background.js` 沒有監聽 `onReplaced`，所以 `mutedTabIds` 仍保存舊 tabId，新 tabId 不會繼承強制靜音。這是 API 事件覆蓋不足造成的缺口。`b77fd1b` 已補上 `chrome.tabs.onReplaced.addListener(...)`，把追蹤狀態從舊 tabId 移到新 tabId。 | 通常延後有感。一般切分頁可能正常，但遇到預載、跳轉或特殊頁面替換後，使用者會覺得「某些頁面突然不受靜音規則控制」。 | 之前做的。這不是今天才建立的設計缺口，今天只是補齊。 |
| 使用者曾選過某個分頁後，如果該分頁被關閉，popup 更新時可能因 `chrome.tabs.get(selectedTabId)` 失敗而中斷。 | `b77fd1b` 前的 `updateButtonStates()` 直接呼叫 `chrome.tabs.get(selectedTabId)`，沒有 try/catch；但 `selectedTabId` 只是 popup 記憶體狀態，分頁可能已經關閉。這時 Chrome API 會丟錯，後續 UI 更新流程就停止。`b77fd1b` 加入 `getTabOrClearSelection()`，失敗時清空選取狀態。 | 延後有感。使用者不是一開始就遇到，而是選過分頁、關掉分頁、再操作 popup 時才可能看到 UI 卡住或沒有更新。 | 之前做的。今天以前的選取分頁邏輯已經有這個缺口。 |
| 下拉選單展開時，選單與按鈕交界處視覺上變窄，且外層直角、內層圓角不一致。 | `946e262:popup.html` 中，`#dropdownList` 使用 `position: absolute; top: 100%; left: 0; right: 0;`，而 `#dropdownButton` 本身保留完整圓角。展開後，列表是浮在按鈕下方，不佔 popup 版面高度，交界處會受按鈕底部圓角和 popup 邊界影響，看起來像接合處變窄。`body` 也沒有 `border-radius`，所以外框是直角、內部元件是圓角。`84c8ca0` 改為列表佔版面高度，並在 `.controls-row.open` 時讓按鈕與列表共用一組上下圓角。 | 高度有感。這是視覺品質問題，使用者一展開選單就會覺得 UI 不精緻、不一致。 | 之前做的。`946e262` 已可看到相同的 absolute dropdown 與直角 body 設計。 |
| 全域靜音開啟後，使用者可以直接關掉開關，繞過「還原全部」的 double check。 | `946e262:popup.js` 的 `handleGlobalMuteChange()` 直接用 `globalMuteToggle.checked` 當新狀態，關閉時會立即對全部 tabs 執行 `chrome.tabs.update(... muted: false)`。`b77fd1b` 雖修了 storage race，但仍保留這條直接關閉路徑。因此這是已存在的設計缺口，不是今天最後一次 UI 修正才造成。`84c8ca0` 改成：若 `isAllMuted` 為 true 且使用者把開關關掉，立即把開關恢復 checked，並顯示還原確認框。 | 高度有感。使用者可能誤觸一下就解除全部靜音，和「需要確認才能全部還原」的安全感不一致。 | 之前做的。`2025-04-25` 的 `946e262` 已有直接關閉邏輯；今天只是修正成需要確認。 |
| 全域靜音開啟後，使用者也可以透過「當前分頁」或「選擇分頁」按鈕間接關掉全域狀態。 | `946e262:popup.js` 與 `b77fd1b:popup.js` 的 `handleCurrentTabMute()` / `handleSelectedTabMute()` 在解除靜音時，如果 `isAllMuted` 為 true，會直接設成 `false` 並同步到 storage。這等於繞過「還原全部」確認流程。`84c8ca0` 已改成在全域靜音狀態下嘗試解除單頁時，只顯示還原確認框，不直接改 tab 或 storage。 | 有感但較情境式。使用者按單頁控制時，可能不知不覺把全域保護關掉，之後新分頁或其他分頁不再被強制靜音。 | 之前做的。今天以前已存在；今天修正。 |

## 驗證紀錄

已執行的檢查：

- `node --check background.js`
- `node --check popup.js`
- `manifest.json` JSON parse，版本目前為 `3.3`
- mock Chrome API 驗證：同時建立多個 tab 時，`mutedTabIds` 不會遺失新增的 id。
- mock Chrome API 驗證：全域靜音開啟後，關閉全域開關只會打開還原確認框，不會直接解除靜音。
- mock Chrome API 驗證：全域靜音開啟後，點擊當前分頁解除靜音也只會打開還原確認框，不會繞過確認流程。

