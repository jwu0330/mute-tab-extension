// popup.js

let mutedTabIds = new Set();
let isAllMuted = false;

document.addEventListener("DOMContentLoaded", async () => {
  const toggleAllBtn = document.getElementById("toggleAll");
  const toggleSelectedBtn = document.getElementById("toggleSelected");
  const toggleCurrentBtn = document.getElementById("toggleCurrent");
  const tabSelect = document.getElementById("tabSelect");
  const selectedTabInfo = document.getElementById("selectedTabInfo");

  // 初始化：讀取 storage 狀態
  const initState = async () => {
    const storage = await chrome.storage.local.get(["mutedTabIds", "isAllMuted"]);
    mutedTabIds = new Set(storage.mutedTabIds || []);
    isAllMuted = storage.isAllMuted || false;

    updateToggleAllButton();
    await updateTabList();
    await updateCurrentMuteButton();
  };

  const updateToggleAllButton = () => {
    const buttonText = isAllMuted ? "全部取消靜音" : "全部靜音";
    const buttonSpan = toggleAllBtn.querySelector('span:not(.button-icon)');
    buttonSpan.textContent = buttonText;
    toggleAllBtn.classList.toggle("muted", isAllMuted);
    toggleAllBtn.classList.toggle("unmuted", !isAllMuted);
    toggleAllBtn.classList.toggle("neutral", false);
    const iconSpan = toggleAllBtn.querySelector('.button-icon');
    iconSpan.textContent = isAllMuted ? "🔇" : "🔊";
  };

  const updateCurrentMuteButton = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isMuted = tab?.mutedInfo?.muted;
    const buttonText = isMuted ? "當前取消靜音" : "當前靜音";
    const buttonSpan = toggleCurrentBtn.querySelector('span:not(.button-icon)');
    buttonSpan.textContent = buttonText;
    toggleCurrentBtn.classList.toggle("muted", isMuted);
    toggleCurrentBtn.classList.toggle("unmuted", !isMuted);
    toggleCurrentBtn.classList.toggle("neutral", false);
    const iconSpan = toggleCurrentBtn.querySelector('.button-icon');
    iconSpan.textContent = isMuted ? "🔇" : "▶️";
  };

  const updateSelectedInfo = () => {
    const tabId = parseInt(tabSelect.value, 10);
    if (!tabId) return;
    chrome.tabs.get(tabId, (tab) => {
      const isMuted = tab?.mutedInfo?.muted;
      const status = isMuted ? "已靜音 🔇" : "播放中 🔊";
      selectedTabInfo.textContent = `狀態：${status}`;
      selectedTabInfo.style.display = "block";
    });
  };

  const updateTabList = async () => {
    const tabs = await chrome.tabs.query({});
    const previousSelectedId = tabSelect.value;
    tabSelect.innerHTML = "";

    tabs.forEach((tab) => {
      const icon = tab.mutedInfo?.muted ? "🔇" : "🔊";
      const option = document.createElement("option");
      option.value = tab.id;
      // 顯示前 40 字做簡化
      option.textContent = `[${icon}] ${tab.title.slice(0, 40)}`;
      tabSelect.appendChild(option);
    });

    if (previousSelectedId) {
      tabSelect.value = previousSelectedId;
    }

    updateSelectedInfo();
  };

  // 「全部靜音 / 取消靜音」按鈕
  toggleAllBtn.addEventListener("click", async () => {
    isAllMuted = !isAllMuted;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      await chrome.tabs.update(tab.id, { muted: isAllMuted });
      if (isAllMuted) {
        mutedTabIds.add(tab.id);
      } else {
        mutedTabIds.delete(tab.id);
      }
    }
    chrome.storage.local.set({
      isAllMuted,
      mutedTabIds: Array.from(mutedTabIds),
    });

    updateToggleAllButton();
    await updateTabList();
    await updateCurrentMuteButton();
  });

  // 「選擇靜音 / 取消靜音」按鈕
  toggleSelectedBtn.addEventListener("click", async () => {
    const tabId = parseInt(tabSelect.value, 10);
    chrome.tabs.get(tabId, async (tab) => {
      const newMuted = !tab.mutedInfo.muted;
      await chrome.tabs.update(tabId, { muted: newMuted });
      if (newMuted) {
        mutedTabIds.add(tabId);
      } else {
        mutedTabIds.delete(tabId);
      }
      chrome.storage.local.set({ mutedTabIds: Array.from(mutedTabIds) });
      await updateTabList();
      updateSelectedInfo();
      await updateCurrentMuteButton();
    });
  });

  // 「當前分頁靜音 / 取消靜音」按鈕
  toggleCurrentBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const newMuted = !tab.mutedInfo.muted;
    await chrome.tabs.update(tab.id, { muted: newMuted });
    if (newMuted) {
      mutedTabIds.add(tab.id);
    } else {
      mutedTabIds.delete(tab.id);
    }
    chrome.storage.local.set({ mutedTabIds: Array.from(mutedTabIds) });
    await updateTabList();
    await updateCurrentMuteButton();
  });

  // 下拉分頁選項改變
  tabSelect.addEventListener("change", updateSelectedInfo);

  // 初始化
  await initState();
});
