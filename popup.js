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
let customDialog;
let dialogConfirm;
let dialogCancel;

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
      dropdownButton.innerHTML = "選擇分頁 ▾";
    }
  });
  restoreButton.addEventListener("click", showRestoreDialog);
  dialogConfirm.addEventListener("click", handleRestoreConfirm);
  dialogCancel.addEventListener("click", hideRestoreDialog);
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
  
  // 更新選中分頁的狀態顯示
  const updatedTab = await chrome.tabs.get(selectedTabId);
  await updateSelectedTabInfo(updatedTab);
  
  // 更新所有 UI 狀態
  await updateUIStates();
  await renderDropdownList();
}

function showRestoreDialog() {
  customDialog.classList.remove("hidden");
}

function hideRestoreDialog() {
  customDialog.classList.add("hidden");
}

async function handleRestoreConfirm() {
  // 隱藏對話框
  hideRestoreDialog();
  
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

// UI 更新相關
async function updateUIStates() {
  await updateButtonStates();
  await renderDropdownList();
  updateRestoreButton();
}

async function updateButtonStates() {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab) return;

  // 使用統一的狀態檢查函數
  currentTabMuteState = await checkTabMuteState(currentTab.id);
  
  // 更新當前分頁按鈕狀態
  updateButtonState(toggleCurrentBtn, currentTabMuteState, "當前");
  
  // 如果有選中的分頁，更新其狀態
  if (selectedTabId) {
    const selectedTabMuteState = await checkTabMuteState(selectedTabId);
    updateButtonState(toggleSelectedBtn, selectedTabMuteState, "選擇");
    
    // 更新下拉按鈕顯示
    const selectedTab = await chrome.tabs.get(selectedTabId);
    updateDropdownButtonDisplay(selectedTab, selectedTabMuteState);
  }
}

// 修改更新按鈕狀態的輔助函數
function updateButtonState(button, isMuted, prefix) {
  const buttonText = prefix === "當前" 
    ? (isMuted ? "當前分頁靜音" : "當前分頁")
    : "分頁音訊開關";
    
  const buttonSpan = button.querySelector('span:not(.button-icon)');
  buttonSpan.textContent = buttonText;
  
  button.classList.remove("muted", "unmuted", "neutral");
  button.classList.add(prefix === "當前" ? (isMuted ? "muted" : "unmuted") : "neutral");
  
  const iconSpan = button.querySelector('.button-icon');
  iconSpan.textContent = isMuted ? "🔇" : (prefix === "當前" ? "▶️" : "🎵");
}

// 新增：更新下拉按鈕顯示的輔助函數
function updateDropdownButtonDisplay(tab, isMuted) {
  const iconEmoji = isMuted ? "🔇" : "🔊";
  const buttonContent = document.createElement("div");
  buttonContent.style.display = "flex";
  buttonContent.style.alignItems = "center";
  buttonContent.style.gap = "8px";
  buttonContent.innerHTML = `
    <span>${iconEmoji}</span>
    ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" style="width: 16px; height: 16px;">` : ''}
    <span style="overflow: hidden; text-overflow: ellipsis;">${tab.title.slice(0, 30)}${tab.title.length > 30 ? '...' : ''}</span>
    <span style="margin-left: auto">▾</span>
  `;
  dropdownButton.innerHTML = '';
  dropdownButton.appendChild(buttonContent);
}

// 修改 renderDropdownList 函數中的狀態檢查
async function renderDropdownList() {
  const tabs = await chrome.tabs.query({});
  dropdownList.innerHTML = "";
  
  for (const tab of tabs) {
    const li = document.createElement("li");
    const isMuted = await checkTabMuteState(tab.id);
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
      updateSelectedTabInfo(tab);
    });
    
    dropdownList.appendChild(li);
  }
}

async function updateSelectedTabInfo(tab) {
  // 檢查分頁的靜音狀態
  const isMuted = await checkTabMuteState(tab.id);
  selectedTabInfo.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
      <span>狀態：</span>
      <span>${isMuted ? "已靜音 🔇" : "播放中 🔊"}</span>
      ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" style="width: 16px; height: 16px;">` : ''}
      <span style="overflow: hidden; text-overflow: ellipsis;">${tab.title.slice(0, 20)}${tab.title.length > 20 ? '...' : ''}</span>
    </div>
  `;
}

// 新增：統一檢查分頁靜音狀態的函數
async function checkTabMuteState(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.mutedInfo?.muted || individualMutedTabs.has(tabId) || isAllMuted;
  } catch (error) {
    console.error('Error checking tab mute state:', error);
    return false;
  }
}

function updateRestoreButton() {
  const hasMutedTabs = individualMutedTabs.size > 0 || globalMutedTabs.size > 0;
  restoreButton.classList.toggle('visible', hasMutedTabs);
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
  customDialog = document.getElementById("customDialog");
  dialogConfirm = document.getElementById("dialogConfirm");
  dialogCancel = document.getElementById("dialogCancel");
  
  // 初始化狀態
  await initializeState();
});

