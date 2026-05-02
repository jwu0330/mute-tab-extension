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

let mutedTabIdsQueue = Promise.resolve();

async function saveState(state) {
  await chrome.storage.local.set({
    isAllMuted: state.isAllMuted,
    mutedTabIds: Array.from(state.mutedTabIds),
  });
}

function serializeState(state) {
  return {
    isAllMuted: state.isAllMuted,
    mutedTabIds: Array.from(state.mutedTabIds),
  };
}

function updateStoredState(mutator) {
  const nextTask = mutedTabIdsQueue
    .catch(() => {})
    .then(async () => {
      const currentState = await getState();
      const nextState = {
        mutedTabIds: new Set(currentState.mutedTabIds),
        isAllMuted: currentState.isAllMuted,
      };
      const result = await mutator(nextState, currentState);

      if (result?.changed) {
        await saveState(nextState);
      }

      return {
        ...result,
        state: serializeState(nextState),
      };
    });

  mutedTabIdsQueue = nextTask.catch(() => {});
  return nextTask;
}

function updateMutedTabIds(mutator) {
  return updateStoredState(async (nextState, currentState) => {
    return mutator(nextState.mutedTabIds, currentState);
  });
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

chrome.runtime.onStartup.addListener(reconcileTabsOnStartup);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "syncMuteState") return;

  syncMuteStateFromPopup(message)
    .then((state) => sendResponse({ ok: true, state }))
    .catch((error) => {
      console.error("Failed to sync mute state:", error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

async function syncMuteStateFromPopup(message) {
  const result = await updateStoredState((nextState) => {
    if (message.clearAll) {
      const changed = nextState.isAllMuted || nextState.mutedTabIds.size > 0;
      nextState.isAllMuted = false;
      nextState.mutedTabIds.clear();
      return { changed };
    }

    let changed = false;
    if (typeof message.isAllMuted === "boolean" && nextState.isAllMuted !== message.isAllMuted) {
      nextState.isAllMuted = message.isAllMuted;
      changed = true;
    }

    for (const tabId of message.addTabIds || []) {
      const sizeBefore = nextState.mutedTabIds.size;
      nextState.mutedTabIds.add(tabId);
      changed = changed || nextState.mutedTabIds.size !== sizeBefore;
    }

    for (const tabId of message.removeTabIds || []) {
      changed = nextState.mutedTabIds.delete(tabId) || changed;
    }

    return { changed };
  });

  return result.state;
}

async function reconcileTabsOnStartup() {
  const tabs = await chrome.tabs.query({});
  const openTabIds = new Set(tabs.map((tab) => tab.id).filter((id) => typeof id === "number"));
  const result = await updateStoredState((nextState) => {
    const nextMutedTabIds = nextState.isAllMuted
      ? new Set(openTabIds)
      : new Set();
    const changed = !areSetsEqual(nextState.mutedTabIds, nextMutedTabIds);
    nextState.mutedTabIds = nextMutedTabIds;
    return { changed, shouldMuteAllOpenTabs: nextState.isAllMuted };
  });

  if (result?.shouldMuteAllOpenTabs) {
    await Promise.all(tabs.map((tab) =>
      typeof tab.id === "number"
        ? chrome.tabs.update(tab.id, { muted: true }).catch(() => {})
        : Promise.resolve()
    ));
  }
}

function areSetsEqual(first, second) {
  if (first.size !== second.size) return false;
  for (const value of first) {
    if (!second.has(value)) return false;
  }
  return true;
}

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
