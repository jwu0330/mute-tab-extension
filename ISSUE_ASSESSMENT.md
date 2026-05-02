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

## 本次新驗證、尚未修正的問題

下表都附上實際 grep / git show / 程式碼路徑作為證據，不是推測。所有檔案行號以工作目錄當前內容（`84c8ca0` 為基底）為準。

| 發生什麼問題 | 找證據的方式：明確指出為什麼這樣做不行 | 使用者的感受 | 時間歸類 |
| --- | --- | --- | --- |
| 在下拉選單中選取另一個分頁後，「選擇靜音」按鈕的圖示不會切換到該分頁的真實靜音狀態。 | `popup.js:282-288` 的 `handleListItemClick` 只呼叫 `updateDropdownButtonDisplay` 與 `updateSelectedTabInfo`，**沒有**呼叫 `updateUIStates()`。對比 `handleSelectedTabMute`（`popup.js:142`）、`handleCurrentTabMute`（`popup.js:110`）、`handleGlobalMuteChange`（`popup.js:88`）、`handleRestoreConfirm`（`popup.js:170`）四個 handler 都有呼叫。`updateButtonStates`（`popup.js:180-200`）才是負責根據 `selectedTabId` 與 `checkTabMuteState` 改寫 `toggleSelectedBtn` 的圖示（`popup.js:223`：`iconSpan.textContent = isMuted ? "🔇" : "🎵"`）。沒有呼叫它，圖示就停在前一個分頁的值。`git show 946e262:popup.js` 確認舊版同一 function 也是缺這一行，並非剛剛改壞。 | 中度有感。使用者選了不同分頁時，會發現按鈕視覺與實際靜音狀態不一致；不致命，但會懷疑按鈕資料是否正確。 | 之前做的。從 `946e262`（2025-04-25）到 `84c8ca0` 都沒補上；今天的兩次提交也沒處理。 |
| popup 開著時，background 在 storage 內加入或移除的 tabId，會在 popup 下一次操作時被整包覆寫掉。 | `popup.js` 全檔 grep `storage.onChanged` 為零（`Grep storage\.onChanged`）。`popup.js:32-41` 的 `loadStoredState` 只在初始化讀一次 storage。`popup.js:404-410` 的 `syncStateToStorage` 直接 `chrome.storage.local.set({ isAllMuted, mutedTabIds: Array.from(individualMutedTabs) })`，是**整包覆寫不做 merge**。在 popup 開著的時間裡，背景會透過 `background.js:67` (`onCreated`)、`background.js:88` (`onUpdated`)、`background.js:113` (`onReplaced`) 把 tabId 加進 storage。下一次 popup 任一動作觸發 `syncStateToStorage`，就會用 popup 內存中的舊 set 把這些新 tabId 蓋掉。`git show 946e262:popup.js` 確認舊版也沒有 `storage.onChanged` 訂閱。 | 累積後才有感。早期不會察覺，但使用者長時間開著 popup 並在期間新增分頁、或被 prerender 替換 tab 時，這些新分頁會從追蹤清單裡消失。之後切換 `isAllMuted` 或操作其他分頁時，會發現「明明應該被靜音的分頁不在管控內」。 | 之前做的。架構性問題，從第一版至今 popup 端都沒訂閱 storage 變更。 |
| popup 的 `syncStateToStorage` 與 background 的 `updateMutedTabIds` 佇列彼此沒有同步，兩邊對同一 key 的並行寫入會丟失更新。 | `background.js:20-37` 的 `updateMutedTabIds` 內含三個 `await` 邊界（`getState` → `mutator` → `saveMutedTabIds`），需要在 read-modify-write 之間維持一致。但 `popup.js:404-410` 的 `syncStateToStorage` 直接呼叫 `chrome.storage.local.set` 而**完全不經過該佇列**，因此 popup 與 background 之間沒有 mutex。具體 trace：`t=0` background.onUpdated 把 task enqueue，`t=2ms` task 讀 storage 得到 `[1,2,3]`，`t=3ms` popup syncStateToStorage 寫入 `[1,2,3,6]`，`t=5ms` background task 用先前讀到的 set 寫入 `[1,2,3,5]`，**tab 6 被覆蓋**。`b77fd1b` 只解決了 background 自身多事件之間的序列化，沒處理跨 popup/background 的情境。 | 偶發、難重現。當下不一定有感，但使用者同時操作 popup 與外部 mute 切換的場景下會發生狀態抖動，最後 popup 的 set 會與 background 的事實不一致。 | 之前做的（架構面）。今天 `b77fd1b` 引入背景佇列，反而把這個跨範圍的 race 暴露得更明顯，但問題本身不是今天才有。 |
| Chrome 重啟（特別是異常關閉後）會讓 storage.mutedTabIds 殘留上個 session 的 tabId，重新開機後可能誤把新分頁當成已追蹤分頁強制靜音。 | `background.js` 全檔 grep `runtime.onStartup` 為零；只有 `background.js:53` 的 `chrome.runtime.onInstalled`，而 `onInstalled` **只**在安裝、更新、Chrome 升級時觸發，瀏覽器一般重啟並不會觸發。MV3 service worker 隨時可能被殺，`tabs.onRemoved` 不保證在關閉瞬間都會被處理，所以 storage.mutedTabIds 可能殘留舊 tabId。下個 session 中，新分頁可能拿到同一 tabId（Chrome 內部從 1 起新編），此時 `background.js:84-95` 的 `onUpdated` 路徑遇到使用者解除靜音的事件，會因 `mutedTabIds.has(tabId)===true` 而把它再次靜音。 | 累積/長期使用後才會遇到，但一遇到使用者會非常困惑：「我新開的分頁怎麼一解除靜音就自動回靜音？」 | 之前做的。從第一版起就沒有 `onStartup`。 |
| 切換全域靜音 ON 的瞬間到 storage 寫入完成之間，新建立的分頁會跳過全域靜音的初始套用。 | `popup.js:66-77` 的順序為「`tabs = await chrome.tabs.query({})` → `forEach add` → `await syncStateToStorage()` → `Promise.all(update)`」。`isAllMuted=true` 是在 `syncStateToStorage` 裡才寫進 storage 的。如果在 `query` 完成後、`syncStateToStorage` 完成前的這個區間內新建分頁，`background.js:62-72` 的 `onCreated` 會 `getState` 讀到舊 storage 的 `isAllMuted=false`，回傳 `{ changed:false, shouldMute:false }`，於是該分頁不會被加入 `mutedTabIds`、也不會被 mute。事後若使用者沒手動操作該分頁，就只能靠 `onUpdated` 在 `mutedInfo.muted===false` 變化時用 `background.js:84-91` 的「補加入」分支救回；但若使用者完全沒去動它，它就會持續播放音訊。 | 偶發。只有「正在切 ON 的同時剛好有新分頁建立」才中招；使用者多半會以為是 Chrome 自身動畫延遲。但只要中招且該分頁在播音訊，是有感的「它不該響卻響了」。 | 之前做的的延伸。`b77fd1b` 把順序改成現在這樣是為了解別的 race，但這個窗口本身在 `946e262` 時代就有（更糟），今天只是稍微縮短了窗口，沒有完全消除。 |

## 驗證紀錄

已執行的檢查：

- `node --check background.js`
- `node --check popup.js`
- `manifest.json` JSON parse，版本目前為 `3.3`
- mock Chrome API 驗證：同時建立多個 tab 時，`mutedTabIds` 不會遺失新增的 id。
- mock Chrome API 驗證：全域靜音開啟後，關閉全域開關只會打開還原確認框，不會直接解除靜音。
- mock Chrome API 驗證：全域靜音開啟後，點擊當前分頁解除靜音也只會打開還原確認框，不會繞過確認流程。

本次新發現的證據檢查：

- `Grep "storage\.onChanged"` 在整個 repo 0 個結果（`mute-tab-extension/popup.js`、`background.js` 都沒有），證實 popup 沒有訂閱 storage 變更。
- `Grep "runtime\.onStartup"` 在整個 repo 0 個結果，證實沒有處理 Chrome 重啟。
- `git log -L:handleListItemClick:popup.js` 顯示 `946e262`、`84c8ca0` 兩個版本的 `handleListItemClick` 都沒呼叫 `updateUIStates`，並非剛剛改壞。
- `git show 946e262:background.js` 與 `a7528f3:background.js` 比對：今天的 `b77fd1b` 引入 `mutedTabIdsQueue`，但只覆蓋 background 內部，popup 端的 `syncStateToStorage` 仍是 `chrome.storage.local.set` 直接覆寫，可在 background 的 read-modify-write 視窗內覆蓋掉它。
- `popup.js:60-77` 的當前順序確認 `query → forEach add → sync → update`；`background.js:62-72` 在 `onCreated` 內呼叫 `getState`，可在 popup 還沒 sync 的時段內讀到舊 `isAllMuted`。

