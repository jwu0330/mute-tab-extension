# 剛剛做的 Code 造成的問題

本文件只收錄問題「起源於 `2026-05-03`（時區 `Asia/Taipei`）今天的修改中」的條目。每筆都附 grep / git show / 檔案行號作為證據，不是推測。

當前 HEAD：`15384d0`。

> 「修改」與否的歸類規則：只看問題本身的起源。即使可以拿之前的版本對照，只要這個具體錯誤是被今天的某個 commit 引入或殘留下來的，就放在本文件。

## 本文件用途與另一份文件的關係

- **本文件做什麼**：收錄問題「起源於今天的修改」的條目。也就是因為我們今天（或最近這一輪）的修改所造成、引入或殘留下來的新問題，全部記錄在本文件。
- **每次該怎麼用**：每一次只要處理到「現在需要更改的問題」、或「因為現在的修改才出現的新問題」，都必須 append 到本文件對應的 (a) 已修改 / (b) 未修改 區塊。每一次都要好好留下記錄，避免後續審核時找不到上下文。**不要覆蓋舊條目，只追加。**
- **不該寫進這裡的**：起源於今天以前的問題（即使今天才被驗證或才被修），**不要** append 到本文件。
- **對方文件**：另一份是 [ISSUES_PRE_EXISTING.md](ISSUES_PRE_EXISTING.md)，專門收錄「起源於今天以前」的問題。如果一個問題的起源是之前，紀錄寫到那份去。

今天涉及的 commit：

- `15384d0`，`2026-05-03 01:00:35 +0800`，移除頂部還原按鈕並修正還原後 selected status 不一致。
- `22dcb99`，`2026-05-03 00:47:43 +0800`，固定 popup 寬度與長文字截斷。
- `47ab98b`，`2026-05-03 00:44:43 +0800`，補充第二輪覆核紀錄。
- `7fe20eb`，`2026-05-03 00:39:05 +0800`，依分類處理「之前做的」5 條問題。
- `84c8ca0`，`2026-05-03 00:26:58 +0800`，修 popup 下拉與還原流程。
- `b77fd1b`，`2026-05-03 00:17:17 +0800`，加固背景同步與 tab 狀態追蹤。
- `a7528f3`，`2026-05-03 00:08:57 +0800`，前一版的全域靜音與 service worker 修正。

## (a) 已修改的部分

| 發生什麼問題 | 找證據的方式 | 使用者的感受 | 修正所在的 commit |
| --- | --- | --- | --- |
| 多個 `tabs.onCreated` 事件並行時，`mutedTabIds` 會互相覆蓋導致 lost update。 | `a7528f3:background.js` 的 `onCreated` 在每個事件中各自 `getState()`、加新 tabId、`saveMutedTabIds()` 整包寫回。兩個 `onCreated` 同時讀到同一份舊資料，後寫入的會覆蓋前一個事件加進去的 tabId。 | 累積型。當下不一定有感，但開很多分頁後某些分頁可能沒被納入強制靜音追蹤，後續操作會發現狀態不穩。 | `b77fd1b` 加入 `mutedTabIdsQueue` 排隊處理 `updateMutedTabIds`，所有讀-改-寫透過同一條鏈序列化。 |
| popup 版面被後續調整成會受內容影響，長分頁標題或按鈕文字可能讓 popup 變寬或換行。 | 使用者明確要求 extension popup 不做 RWD、採固定寬度。`22dcb99` 前的 `popup.html` 只有 `body { min-width: 350px; }` 與 `.card { max-width: 380px; }`，缺少固定 `width/min-width/max-width` 同步約束；按鈕、下拉項目與動態建立的分頁標題也沒有完整的 `min-width: 0`、`white-space: nowrap`、`text-overflow: ellipsis`，長字串可能撐開容器或換行。 | 高度有感。popup 每次點擊時可能忽大忽小，或按鈕文字變成兩行，使用者會覺得版面不穩。 | `22dcb99` 在 `popup.html` 加上 `--popup-width: 412px`、固定根層/body 寬度，並補齊按鈕、下拉、狀態列的單行截斷；`popup.js` 動態建立元素也補 `minWidth` / `flexShrink`。 |
| `84c8ca0` 已把「關閉全域靜音」改成透過全域開關跳確認，但舊的頂部「還原全部」按鈕仍保留，造成重複入口與介面雜訊。 | `84c8ca0` 的 `handleGlobalMuteChange()` 已在 `isAllMuted=true` 且使用者切 off 時呼叫 `showRestoreDialog()`；但 `22dcb99:popup.html` 仍保留 `<button id="restoreButton">還原全部</button>`，`22dcb99:popup.js` 也還有 `restoreButton.addEventListener("click", showRestoreDialog)` 與 `updateRestoreButton()`。同一個「全部解除」動作因此同時存在頂部按鈕與全域開關兩個入口。 | 高度有感。UI 看起來比較亂，而且使用者不確定應該按頂部按鈕還是切全域開關。 | `15384d0` 移除 `restoreButton` DOM、CSS、事件監聽與 `updateRestoreButton()`，只保留關閉全域開關後的確認流程。 |
| 選取下拉清單項目後，`handleListItemClick()` 會立刻把 `dropdownList` 加上 `hidden` 並移除 `.open`，而「分頁音訊開關」又只是中性按鈕，沒有用同一套 selected tab 狀態更新播放/靜音顯示。 | 本輪修改前的 `popup.js` 中 `handleListItemClick(tab)` 會執行 `dropdownList.classList.add("hidden")`、`dropdownButton.parentElement.classList.remove("open")`；`updateButtonState(toggleSelectedBtn, selectedTabMuteState, "選擇")` 永遠把選取分頁按鈕文字寫成「分頁音訊開關」且 class 固定 `neutral`。 | 高度有感。使用者選完分頁後表單收起來，無法同時看清單與控制；上方控制與下方「播放中/已靜音」也容易看起來不是同一個狀態來源。 | 本輪提交將選取分頁控制改成 `selectedAudioSwitch`，用 `updateSelectedAudioControl()` 同步「分頁播放/分頁靜音」與「播放/靜音」；選取清單項目不再收合，並以 `.selected` 淺藍色標示目前選到的分頁。 |

## (b) 未修改的部分

| 發生什麼問題 | 找證據的方式 | 使用者的感受 | 為什麼還沒處理 |
| --- | --- | --- | --- |
| `background.js:14-16` 的 `saveMutedTabIds(set)` 已沒人呼叫，但仍留在檔案中。 | `Grep "saveMutedTabIds" -- background.js` 在當前工作目錄下只剩函式定義那一行；`muteTabIfTracked` 的 catch 與其他寫入路徑都改走 `updateMutedTabIds` / `updateStoredState`。在 `git show 760da53:background.js` 還是有兩處呼叫，到 `7fe20eb` 之後變成沒人用。 | 沒感。屬於程式碼整潔／可讀性，不影響執行結果，但讀程式碼的人會困惑為何留著。 | 死碼是 `7fe20eb` 把寫入路徑改走 `updateStoredState` / `saveState` 之後留下來的，屬於剛剛做的殘留。依規則「剛剛做的請暫時不要變動，要先審核」，先保留等審核。 |
| `background.js:101-130` 的 `syncMuteStateFromPopup(message)` 對 `message.addTabIds` / `message.removeTabIds` 沒做 `typeof === "number"` 防呆。 | 程式碼直接 `for (const tabId of message.addTabIds || []) { nextState.mutedTabIds.add(tabId) }`、`nextState.mutedTabIds.delete(tabId)`。對比 `popup.js:102-104` 在切換全域靜音時已有 `.filter((tabId) => typeof tabId === "number")`，說明專案內已知 tabId 可能不是 number，但 background 端沒有對齊。 | 在這個擴充功能影響極小：沒有 content script，message 來源只有 popup，且 popup 自己會先過濾。但若未來新增其他發訊端、或 popup 程式碼改寫漏了過濾，就可能把非 number 的值寫進 `mutedTabIds`。 | `chrome.runtime.onMessage` 通道與 `syncMuteStateFromPopup` 都是 `7fe20eb` 才加進來的，屬於剛剛做的。等審核。 |
