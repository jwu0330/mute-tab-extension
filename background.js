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

let mutedTabIdsQueue = Promise.resolve();

function updateMutedTabIds(mutator) {
  const nextTask = mutedTabIdsQueue
    .catch(() => {})
    .then(async () => {
      const state = await getState();
      const nextMutedTabIds = new Set(state.mutedTabIds);
      const result = await mutator(nextMutedTabIds, state);

      if (result?.changed) {
        await saveMutedTabIds(nextMutedTabIds);
      }

      return result;
    });

  mutedTabIdsQueue = nextTask.catch(() => {});
  return nextTask;
}

async function muteTabIfTracked(tabId) {
  const { mutedTabIds, isAllMuted } = await getState();
  if (!isAllMuted && !mutedTabIds.has(tabId)) return;

  try {
    await chrome.tabs.update(tabId, { muted: true });
  } catch (error) {
    await updateMutedTabIds((nextMutedTabIds) => {
      const changed = nextMutedTabIds.delete(tabId);
      return { changed };
    });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get("mutedTabIds");
  if (!data.mutedTabIds) {
    await chrome.storage.local.set({ mutedTabIds: [] });
  }
});

// 全域靜音開啟時，新分頁也立即靜音
chrome.tabs.onCreated.addListener(async (tab) => {
  if (typeof tab.id !== "number") return;

  const result = await updateMutedTabIds((nextMutedTabIds, { isAllMuted }) => {
    if (!isAllMuted) return { changed: false, shouldMute: false };
    const sizeBefore = nextMutedTabIds.size;
    nextMutedTabIds.add(tab.id);
    return {
      changed: nextMutedTabIds.size !== sizeBefore,
      shouldMute: true,
    };
  });

  if (result?.shouldMute) {
    await muteTabIfTracked(tab.id);
  }
});

// 強制維持靜音：只在 mutedInfo 真的有變化時才檢查，避免 N 次 storage 讀
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.mutedInfo || changeInfo.mutedInfo.muted !== false) return;

  const { mutedTabIds, isAllMuted } = await getState();
  if (isAllMuted && !mutedTabIds.has(tabId)) {
    await updateMutedTabIds((nextMutedTabIds, state) => {
      if (!state.isAllMuted) return { changed: false };
      const sizeBefore = nextMutedTabIds.size;
      nextMutedTabIds.add(tabId);
      return { changed: nextMutedTabIds.size !== sizeBefore };
    });
  }

  if (isAllMuted || mutedTabIds.has(tabId)) {
    await muteTabIfTracked(tabId);
  }
});

// 分頁關閉時把 tabId 從清單移除，避免 Chrome 回收 id 後誤靜音
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await updateMutedTabIds((nextMutedTabIds) => {
    const changed = nextMutedTabIds.delete(tabId);
    return { changed };
  });
});

// Chrome 可能因 prerender/instant 將既有分頁替換成新的 tabId，需要移轉追蹤狀態。
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  const result = await updateMutedTabIds((nextMutedTabIds, { isAllMuted }) => {
    const wasTracked = nextMutedTabIds.delete(removedTabId);
    const shouldMute = wasTracked || isAllMuted;

    if (shouldMute) {
      nextMutedTabIds.add(addedTabId);
    }

    return {
      changed: wasTracked || shouldMute,
      shouldMute,
    };
  });

  if (result?.shouldMute) {
    await muteTabIfTracked(addedTabId);
  }
});
