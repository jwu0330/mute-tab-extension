// background.js

// service worker 隨時可能被 idle / restart，所以所有事件處理函式都直接從 storage 讀，
// 不再依賴 module-level 變數的快取，避免冷啟動 race。

async function getState() {
  const data = await chrome.storage.local.get(["mutedTabIds", "isAllMuted"]);
  return {
    mutedTabIds: new Set(data.mutedTabIds || []),
    isAllMuted: !!data.isAllMuted,
  };
}

async function saveMutedTabIds(set) {
  await chrome.storage.local.set({ mutedTabIds: Array.from(set) });
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get("mutedTabIds");
  if (!data.mutedTabIds) {
    await chrome.storage.local.set({ mutedTabIds: [] });
  }
});

// 全域靜音開啟時，新分頁也立即靜音
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.id) return;
  const { isAllMuted, mutedTabIds } = await getState();
  if (!isAllMuted) return;

  await chrome.tabs.update(tab.id, { muted: true });
  mutedTabIds.add(tab.id);
  await saveMutedTabIds(mutedTabIds);
});

// 強制維持靜音：只在 mutedInfo 真的有變化時才檢查，避免 N 次 storage 讀
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.mutedInfo || changeInfo.mutedInfo.muted !== false) return;

  const { mutedTabIds } = await getState();
  if (mutedTabIds.has(tabId)) {
    chrome.tabs.update(tabId, { muted: true });
  }
});

// 分頁關閉時把 tabId 從清單移除，避免 Chrome 回收 id 後誤靜音
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { mutedTabIds } = await getState();
  if (mutedTabIds.delete(tabId)) {
    await saveMutedTabIds(mutedTabIds);
  }
});
