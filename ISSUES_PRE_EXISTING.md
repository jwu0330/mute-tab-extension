# 之前做的 Code 造成的問題

本文件只收錄問題「起源於 `2026-05-03` 之前」的條目（時區 `Asia/Taipei`）。每筆都附 grep / git show / 檔案行號作為證據，不是推測。

當前 HEAD：`47ab98b`。

> 「修改」與否的歸類規則：只看問題本身的起源。即使該問題是在今天才被驗證、或修正動作是在今天完成，只要起源在今天以前就放在本文件。

## (a) 已更改的部分

| 發生什麼問題 | 找證據的方式 | 使用者的感受 | 修正所在的 commit |
| --- | --- | --- | --- |
| popup 開啟時，「全域靜音」開關沒反映 storage 真實狀態。 | `git show 946e262:popup.js` 與 `git show a7528f3:popup.js` 的 `loadStoredState()` 只把 `storage.isAllMuted` 寫入 JS 變數，沒寫到 `globalMuteToggle.checked`。 | 有感。畫面與實際靜音狀態不一致，會以為功能壞掉或被重置。 | `b77fd1b` 補上 `globalMuteToggle.checked = isAllMuted`。 |
| 解除某個已追蹤分頁靜音時，background 立刻把它打回靜音。 | `946e262:popup.js` / `a7528f3:popup.js` 的 `handleCurrentTabMute()` / `handleSelectedTabMute()` 流程是先 `chrome.tabs.update(..., { muted: false })`、之後才同步 storage。background 的 `tabs.onUpdated` 在 `mutedInfo.muted === false` 時會檢查舊清單，tabId 還在就重新 mute。 | 高度有感。按了取消靜音馬上又被自動靜音，會覺得按鈕失效。 | `b77fd1b` 改成先把意圖同步到 storage，再更新 tab。 |
| Chrome 因 prerender / instant 用新 tabId 取代舊 tabId 時，原本的靜音追蹤不會移轉。 | 今天以前的 `background.js` 沒監聽 `tabs.onReplaced(addedTabId, removedTabId)`，因此 `mutedTabIds` 仍保留舊 tabId、新 tabId 不繼承。 | 通常延後有感。一般切換沒事，但遇到預載／替換時會感到「某些頁面突然不受靜音規則控制」。 | `b77fd1b` 補上 `chrome.tabs.onReplaced.addListener(...)`。 |
| 選過某個分頁後關閉它，popup 再操作時 `chrome.tabs.get(selectedTabId)` 會丟錯導致 UI 更新中斷。 | `b77fd1b` 前 `updateButtonStates()` 直接呼叫 `chrome.tabs.get(selectedTabId)`，沒 try / catch。`selectedTabId` 只是 popup 記憶體狀態，分頁可能已關閉。 | 延後有感。要先選、再關、再操作才會中招，看起來像 popup 卡住。 | `b77fd1b` 加入 `getTabOrClearSelection()`，失敗時清空選取。 |
| 下拉選單展開時與按鈕交界視覺變窄，外層直角、內層圓角不一致。 | `946e262:popup.html` 的 `#dropdownList` 用 `position: absolute; top: 100%`，按鈕本身保留完整圓角；`body` 沒 `border-radius`。 | 高度有感。一展開就覺得 UI 不精緻、不一致。 | `84c8ca0` 改為列表佔版面高度，並用 `.controls-row.open` 讓按鈕與列表共用一組上下圓角。 |
| 全域靜音開啟後可以直接把開關關掉，繞過「還原全部」的二次確認。 | `946e262:popup.js` 的 `handleGlobalMuteChange()` 直接用 `globalMuteToggle.checked` 當新狀態，關閉時對全部 tabs 立即 unmute。 | 高度有感。誤觸一下就解除全部靜音，與「需要確認才能還原」的安全感不一致。 | `84c8ca0` 改為若 `isAllMuted` 為 true 而使用者切 off，把開關恢復為 checked 並顯示確認框。 |
| 全域靜音開啟後，可以透過「當前分頁」或「選擇分頁」按鈕間接關掉全域狀態。 | `946e262:popup.js` 與 `b77fd1b:popup.js` 的 `handleCurrentTabMute()` / `handleSelectedTabMute()` 解除靜音時若 `isAllMuted=true`，直接把它設成 `false` 並同步。 | 有感但情境式。按單頁控制時可能不知不覺把全域保護關掉，之後新分頁不再被強制靜音。 | `84c8ca0` 改成在全域靜音狀態下嘗試解除單頁時只顯示確認框，不直接改 tab 或 storage。 |
| 在下拉選單中選取另一個分頁後，「選擇靜音」按鈕的圖示不會切換到該分頁的真實靜音狀態。 | `git show 946e262:popup.js` 與 `84c8ca0:popup.js` 的 `handleListItemClick()` 都沒呼叫負責改寫圖示的 `updateButtonStates()` / `updateUIStates()`。對比 `handleSelectedTabMute()` / `handleCurrentTabMute()` / `handleGlobalMuteChange()` / `handleRestoreConfirm()` 都有呼叫。 | 中度有感。選了不同分頁時按鈕視覺與實際狀態不一致。 | `7fe20eb` 在 `handleListItemClick()` 末尾加上 `await updateButtonStates()`。 |
| popup 開啟時，background 在 storage 裡加入或移除的 tabId 會被 popup 下一次操作整包覆寫。 | `Grep "storage\.onChanged"` 在 `7fe20eb` 之前的 `popup.js` 為 0 個結果。`syncStateToStorage` 是 `chrome.storage.local.set({ isAllMuted, mutedTabIds: Array.from(individualMutedTabs) })` 整包覆寫不做 merge。 | 累積後才有感。長時間開著 popup、期間新增分頁或被 prerender 替換的 tab 會從追蹤清單裡消失。 | `7fe20eb` 在 popup 加上 `chrome.storage.onChanged` listener，且讓寫入改走 `chrome.runtime.sendMessage`（見下一條）。 |
| popup 的 `syncStateToStorage` 與 background 的 `updateMutedTabIds` 佇列不同步，兩邊對 `mutedTabIds` 並行寫入會丟失更新。 | `b77fd1b:background.js` 的 `updateMutedTabIds` 內含三個 `await` 邊界（`getState` → `mutator` → `saveMutedTabIds`）。`b77fd1b:popup.js` 的 `syncStateToStorage` 直接 `chrome.storage.local.set` 不經過該佇列。`b77fd1b` 只解決了 background 自身多事件的序列化，沒解決跨 popup/background。 | 偶發、難重現。同時操作 popup 與外部 mute 切換時會抖動，最後狀態與事實不一致。 | `7fe20eb` 把 popup 寫入改走 `chrome.runtime.sendMessage({ type: "syncMuteState" })`，由 background 的 `updateStoredState` 用同一個 `mutedTabIdsQueue` 序列化。 |
| Chrome 重啟（特別是異常關閉後）會讓 `storage.mutedTabIds` 殘留上個 session 的 tabId，新 session 中可能誤把新分頁強制靜音。 | `Grep "runtime\.onStartup"` 在 `7fe20eb` 之前為 0 個結果；`onInstalled` 不會在瀏覽器一般重啟時觸發。MV3 service worker 隨時可能被殺，`tabs.onRemoved` 也不保證在關閉瞬間都被處理。 | 累積／長期使用後才會遇到，但一遇到使用者非常困惑：「新開的分頁怎麼一解除靜音就自動回靜音？」 | `7fe20eb` 加上 `chrome.runtime.onStartup` + `reconcileTabsOnStartup()`：非全域靜音時清空孤兒 ID；全域靜音時以目前開啟的 tabIds 重建追蹤並重新 mute。 |
| 切換全域靜音 ON 的瞬間到 storage 寫入完成之間，新建立的分頁會跳過全域靜音的初始套用。 | `b77fd1b:popup.js:60-77` 的順序是 `query → forEach add → sync → update`。`isAllMuted=true` 是在 `syncStateToStorage` 才寫進 storage。`background.js` 的 `onCreated` 在 `query` 完成之後、`sync` 完成之前讀到的仍是舊 `isAllMuted=false`，於是該分頁不會被加入追蹤、也不會被 mute。 | 偶發。但只要中招且該分頁在播音訊就是有感的「它不該響卻響了」。 | `7fe20eb` 改為先 `await syncStateToStorage({ isAllMuted: true })`，再 `chrome.tabs.query`，再加入並同步 `addTabIds`，再 `chrome.tabs.update`，把窗口縮到極小且配合 background queue 排序消除實際漏接。 |

## (b) 未更改的部分

| 發生什麼問題 | 找證據的方式 | 使用者的感受 | 為什麼這輪沒改 |
| --- | --- | --- | --- |
| `popup.js:109` 與 `popup.js:208` 的 `Promise.all(tabIds.map(... chrome.tabs.update ...))` 在任一分頁正好被關閉時 fail-fast，導致同個 handler 後面的 `await updateUIStates()` 被略過。 | 失敗模式從 `946e262:popup.js` 的 `for (const tab of tabs) { await chrome.tabs.update(...) }` 時代就在；`a7528f3` 把它改為 `Promise.all(...)`，仍然在任一個 reject 時整批 reject。`background.js:144-149` 的 `reconcileTabsOnStartup` 已示範 `chrome.tabs.update(...).catch(() => {})` 的逐個容錯寫法，可以對照。 | 影響極小。`7fe20eb` 加的 `chrome.storage.onChanged` listener 在 background 發 `onRemoved` 後會把 popup 的 `individualMutedTabs` 與按鈕狀態收斂回正確值，使用者最差只看到極短暫的 UI 不一致。 | 失敗模式雖然之前做的就有，但 `Promise.all` 那兩行是 `a7528f3` 引入的，要改就會動到「剛剛做的」程式碼線；目前實際影響已被 listener 收斂，先不動。 |
| `popup.js:215-220` 的 `updateUIStates()` 不論下拉是否展開都呼叫 `renderDropdownList()`，每次都跑 N 次 `chrome.tabs.get`。 | `git show 946e262:popup.js` 的 `updateUIStates` 寫法相同（無條件呼叫 `renderDropdownList`）。對比 `7fe20eb:popup.js:80-82` 的 `handleStorageChanged` 已經有 `if (!dropdownList.classList.contains("hidden")) { ... }` 條件保護，顯示專案內已經有正確的寫法可對齊。 | 沒感。屬於效能議題，不影響正確性，分頁多時略有延遲但通常感受不到。 | 修正會涉及多個 handler 的呼叫慣例調整；不是正確性問題，且影響很小，這輪先不動。 |
