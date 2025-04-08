// background.js

// ★ 新增：在 Service Worker 載入時，就馬上從 chrome.storage 讀取最新的 mutedTabIds & isAllMuted
let mutedTabIds = new Set();
let isAllMuted = false;

chrome.storage.local.get(["mutedTabIds", "isAllMuted"], (data) => {
  if (data.mutedTabIds) {
    mutedTabIds = new Set(data.mutedTabIds);
  }
  if (typeof data.isAllMuted !== "undefined") {
    isAllMuted = data.isAllMuted;
  }
});

// ★ 新增：任何時候只要 local storage 有變更，都同步更新到記憶體變數
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.mutedTabIds) {
      mutedTabIds = new Set(changes.mutedTabIds.newValue || []);
    }
    if (changes.isAllMuted) {
      isAllMuted = changes.isAllMuted.newValue;
    }
  }
});

// ★ 若你仍想在擴充功能「初次安裝或更新」時執行特別邏輯，可以留以下，但要注意避免覆蓋現有資料：
chrome.runtime.onInstalled.addListener(() => {
  // 例如只在首次安裝時執行某些動作，你也可以先檢查 data 是否已存在
  chrome.storage.local.get("mutedTabIds", (data) => {
    if (!data.mutedTabIds) {
      chrome.storage.local.set({ mutedTabIds: [] });
    }
  });
});

// ★ 新增：如果全部靜音(isAllMuted)已經開啟，當新分頁被建立時，也立即把它加入靜音
chrome.tabs.onCreated.addListener((tab) => {
  if (isAllMuted && tab.id) {
    chrome.tabs.update(tab.id, { muted: true }, () => {
      mutedTabIds.add(tab.id);
      chrome.storage.local.set({ mutedTabIds: Array.from(mutedTabIds) });
    });
  }
});


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    mutedTabIds.has(tabId) &&
    tab?.mutedInfo &&
    tab.mutedInfo.muted === false
  ) {
    chrome.tabs.update(tabId, { muted: true });
  }
});
