# 剛剛做的 Code 造成的問題

本文件只收錄問題「起源於 `2026-05-03`（時區 `Asia/Taipei`）今天的修改中」的條目。每筆都附 grep / git show / 檔案行號作為證據，不是推測。

當前 HEAD：`22dcb99`。

> 「修改」與否的歸類規則：只看問題本身的起源。即使可以拿之前的版本對照，只要這個具體錯誤是被今天的某個 commit 引入或殘留下來的，就放在本文件。

今天涉及的 commit：

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

## (b) 未修改的部分

| 發生什麼問題 | 找證據的方式 | 使用者的感受 | 為什麼還沒處理 |
| --- | --- | --- | --- |
| `background.js:14-16` 的 `saveMutedTabIds(set)` 已沒人呼叫，但仍留在檔案中。 | `Grep "saveMutedTabIds" -- background.js` 在當前工作目錄下只剩函式定義那一行；`muteTabIfTracked` 的 catch 與其他寫入路徑都改走 `updateMutedTabIds` / `updateStoredState`。在 `git show 760da53:background.js` 還是有兩處呼叫，到 `7fe20eb` 之後變成沒人用。 | 沒感。屬於程式碼整潔／可讀性，不影響執行結果，但讀程式碼的人會困惑為何留著。 | 死碼是 `7fe20eb` 把寫入路徑改走 `updateStoredState` / `saveState` 之後留下來的，屬於剛剛做的殘留。依規則「剛剛做的請暫時不要變動，要先審核」，先保留等審核。 |
| `background.js:101-130` 的 `syncMuteStateFromPopup(message)` 對 `message.addTabIds` / `message.removeTabIds` 沒做 `typeof === "number"` 防呆。 | 程式碼直接 `for (const tabId of message.addTabIds || []) { nextState.mutedTabIds.add(tabId) }`、`nextState.mutedTabIds.delete(tabId)`。對比 `popup.js:102-104` 在切換全域靜音時已有 `.filter((tabId) => typeof tabId === "number")`，說明專案內已知 tabId 可能不是 number，但 background 端沒有對齊。 | 在這個擴充功能影響極小：沒有 content script，message 來源只有 popup，且 popup 自己會先過濾。但若未來新增其他發訊端、或 popup 程式碼改寫漏了過濾，就可能把非 number 的值寫進 `mutedTabIds`。 | `chrome.runtime.onMessage` 通道與 `syncMuteStateFromPopup` 都是 `7fe20eb` 才加進來的，屬於剛剛做的。等審核。 |
