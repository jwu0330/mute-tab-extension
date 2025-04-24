// popup.js

// 全域狀態變數
let isAllMuted = false;
let globalMutedTabs = new Set();
let individualMutedTabs = new Set();
let selectedTabId = null;

// UI 狀態變數
let isRestoreButtonVisible = false;
let currentTabMuteState = false;
let selectedTabMuteState = false;

// DOM 元素
let globalMuteToggle;
let toggleSelectedBtn;
let toggleCurrentBtn;
let dropdownButton;
let dropdownList;
let selectedTabInfo;
let restoreButton;

// 初始化相關
async function initializeState() {
  // 載入儲存的狀態
  await loadStoredState();
  
  // 設定事件監聽器
  setupEventListeners();
  
  // 初始化 UI
  await updateUIStates();
}

async function loadStoredState() {
  const storage = await chrome.storage.local.get(["mutedTabIds", "isAllMuted"]);
  if (storage.mutedTabIds) {
    individualMutedTabs = new Set(storage.mutedTabIds);
  }
  if (typeof storage.isAllMuted !== "undefined") {
    isAllMuted = storage.isAllMuted;
  }
}

function setupEventListeners() {
  globalMuteToggle.addEventListener("change", handleGlobalMuteChange);
  toggleSelectedBtn.addEventListener("click", handleSelectedTabMute);
  toggleCurrentBtn.addEventListener("click", handleCurrentTabMute);
  dropdownButton.addEventListener("click", () => {
    const isHidden = dropdownList.classList.toggle("hidden");
    if (isHidden) {
      // 當選單收合時，恢復到原始的 HTML 內容
      dropdownButton.innerHTML = "選擇分頁 ▾";
    }
  });
  restoreButton.addEventListener("click", handleRestore);
}

// 靜音控制相關
async function handleGlobalMuteChange() {
  isAllMuted = globalMuteToggle.checked;
  const tabs = await chrome.tabs.query({});
  
  for (const tab of tabs) {
    await chrome.tabs.update(tab.id, { muted: isAllMuted });
    if (isAllMuted) {
      globalMutedTabs.add(tab.id);
    } else {
      globalMutedTabs.delete(tab.id);
    }
  }
  
  await syncStateToStorage();
  await updateUIStates();
}

async function handleCurrentTabMute() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  
  const newMuted = !tab.mutedInfo?.muted;
  await chrome.tabs.update(tab.id, { muted: newMuted });
  
  if (newMuted) {
    individualMutedTabs.add(tab.id);
  } else {
    individualMutedTabs.delete(tab.id);
  }
  
  await syncStateToStorage();
  await updateUIStates();
}

async function handleSelectedTabMute() {
  if (!selectedTabId) return;
  
  if (isAllMuted) {
    isAllMuted = false;
    globalMuteToggle.checked = false;
    await syncStateToStorage();
  }
  
  const tab = await chrome.tabs.get(selectedTabId);
  const newMuted = !tab.mutedInfo?.muted;
  await chrome.tabs.update(selectedTabId, { muted: newMuted });
  
  if (newMuted) {
    individualMutedTabs.add(selectedTabId);
  } else {
    individualMutedTabs.delete(selectedTabId);
  }
  
  await syncStateToStorage();
  await updateUIStates();
}

async function handleRestore() {
  // 顯示確認對話框
  if (confirm("確定要還原全部靜音設定嗎？")) {
    // 重置所有狀態
    isAllMuted = false;
    globalMutedTabs.clear();
    individualMutedTabs.clear();
    globalMuteToggle.checked = false;
    
    // 更新所有分頁的靜音狀態
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      await chrome.tabs.update(tab.id, { muted: false });
    }
    
    // 同步狀態到 storage
    await syncStateToStorage();
    
    // 更新 UI
    await updateUIStates();
    
    // 隱藏還原按鈕
    restoreButton.style.display = "none";
  }
}

// UI 更新相關
async function updateUIStates() {
  await updateButtonStates();
  await renderDropdownList();
  updateRestoreButton();
}

async function updateButtonStates() {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabMuteState = currentTab?.mutedInfo?.muted || false;
  
  const currentButtonText = currentTabMuteState ? "當前取消靜音" : "當前靜音";
  const currentButtonSpan = toggleCurrentBtn.querySelector('span:not(.button-icon)');
  currentButtonSpan.textContent = currentButtonText;
  
  // 更新按鈕樣式
  toggleCurrentBtn.classList.remove("muted", "unmuted", "neutral");
  if (currentTabMuteState) {
    toggleCurrentBtn.classList.add("muted");  // 靜音時顯示紅色
  } else {
    toggleCurrentBtn.classList.add("unmuted");  // 非靜音時顯示綠色
  }
  
  const currentIconSpan = toggleCurrentBtn.querySelector('.button-icon');
  currentIconSpan.textContent = currentTabMuteState ? "🔇" : "▶️";
}

async function renderDropdownList() {
  const tabs = await chrome.tabs.query({});
  dropdownList.innerHTML = "";
  
  tabs.forEach(tab => {
    const li = document.createElement("li");
    const isMuted = isTabMuted(tab.id);
    const iconEmoji = isMuted ? "🔇" : "🔊";
    
    // Emoji
    const spn = document.createElement("span");
    spn.textContent = iconEmoji;
    li.appendChild(spn);
    
    // Favicon
    if (tab.favIconUrl) {
      const img = document.createElement("img");
      img.src = tab.favIconUrl;
      li.appendChild(img);
    }
    
    // 標題
    const t = document.createElement("span");
    t.textContent = tab.title.slice(0, 40);
    li.appendChild(t);
    
    // 點擊選擇
    li.addEventListener("click", () => {
      selectedTabId = tab.id;
      dropdownButton.textContent = `${iconEmoji} ${tab.title.slice(0, 20)} ▾`;
      selectedTabInfo.textContent = `狀態：${isMuted ? "已靜音 🔇" : "播放中 🔊"}`;
    });
    
    dropdownList.appendChild(li);
  });
}

function updateRestoreButton() {
  const hasMutedTabs = individualMutedTabs.size > 0 || globalMutedTabs.size > 0;
  restoreButton.style.display = hasMutedTabs ? "block" : "none";
}

// 狀態同步相關
async function syncStateToStorage() {
  await chrome.storage.local.set({
    isAllMuted,
    mutedTabIds: Array.from(individualMutedTabs)
  });
}

// 狀態檢查相關
function isTabMuted(tabId) {
  return globalMutedTabs.has(tabId) || individualMutedTabs.has(tabId);
}

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
  // 獲取 DOM 元素
  globalMuteToggle = document.getElementById("globalMuteToggle");
  toggleSelectedBtn = document.getElementById("toggleSelected");
  toggleCurrentBtn = document.getElementById("toggleCurrent");
  dropdownButton = document.getElementById("dropdownButton");
  dropdownList = document.getElementById("dropdownList");
  selectedTabInfo = document.getElementById("selectedTabInfo");
  restoreButton = document.getElementById("restoreButton");
  
  // 初始化狀態
  await initializeState();
});
