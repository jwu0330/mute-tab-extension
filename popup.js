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
    if (!isHidden) {
      renderDropdownList(); // 重新渲染列表以確保狀態最新
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
      individualMutedTabs.add(tab.id);
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
    // 如果是全域靜音狀態，需要先關閉
    if (isAllMuted) {
      isAllMuted = false;
      globalMuteToggle.checked = false;
    }
  }
  
  await syncStateToStorage();
  await updateUIStates();
  
  // 如果當前分頁就是選中的分頁，更新下方狀態顯示
  if (selectedTabId === tab.id) {
    await updateSelectedTabInfo(tab);
  }
}

async function handleSelectedTabMute() {
  if (!selectedTabId) return;
  
  if (isAllMuted) {
    isAllMuted = false;
    globalMuteToggle.checked = false;
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
  
  // 更新顯示
  await updateDropdownButtonDisplay(tab);
  await updateSelectedTabInfo(tab);
  await updateUIStates();
}

function showRestoreDialog() {
  customDialog.classList.remove("hidden");
}

function hideRestoreDialog() {
  customDialog.classList.add("hidden");
}

async function handleRestoreConfirm() {
  hideRestoreDialog();
  
  // 重置所有狀態
  isAllMuted = false;
  individualMutedTabs.clear();
  globalMuteToggle.checked = false;
  
  // 更新所有分頁的靜音狀態
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await chrome.tabs.update(tab.id, { muted: false });
  }
  
  // 同步狀態
  await syncStateToStorage();
  await updateUIStates();
}

// UI 更新相關
async function updateUIStates() {
  await updateButtonStates();
  await renderDropdownList();
  await updateRestoreButton();
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
    updateDropdownButtonDisplay(selectedTab);
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
async function updateDropdownButtonDisplay(tab) {
  const isMuted = await checkTabMuteState(tab.id);
  const iconEmoji = isMuted ? "🔇" : "🔊";
  
  const buttonContent = document.createElement("div");
  buttonContent.style.display = "flex";
  buttonContent.style.alignItems = "center";
  buttonContent.style.width = "100%";
  buttonContent.style.gap = "4px";
  
  // 音訊圖示
  const audioIcon = document.createElement("span");
  audioIcon.textContent = iconEmoji;
  buttonContent.appendChild(audioIcon);
  
  // 分頁圖示
  if (tab.favIconUrl) {
    const img = document.createElement("img");
    img.src = tab.favIconUrl;
    img.style.width = "16px";
    img.style.height = "16px";
    img.style.flexShrink = "0";
    buttonContent.appendChild(img);
  }
  
  // 分頁標題
  const titleSpan = document.createElement("span");
  titleSpan.style.overflow = "hidden";
  titleSpan.style.textOverflow = "ellipsis";
  titleSpan.style.whiteSpace = "nowrap";
  titleSpan.style.flex = "1";
  titleSpan.textContent = tab.title;
  buttonContent.appendChild(titleSpan);
  
  // 下拉箭頭
  const arrow = document.createElement("span");
  arrow.textContent = "▾";
  arrow.style.marginLeft = "4px";
  arrow.style.flexShrink = "0";
  buttonContent.appendChild(arrow);
  
  dropdownButton.innerHTML = '';
  dropdownButton.appendChild(buttonContent);
}

// 點擊列表項目時的處理
async function handleListItemClick(tab) {
  selectedTabId = tab.id;
  await updateDropdownButtonDisplay(tab);
  await updateSelectedTabInfo(tab);
}

// 更新渲染下拉列表
async function renderDropdownList() {
  const tabs = await chrome.tabs.query({});
  dropdownList.innerHTML = "";
  
  for (const tab of tabs) {
    const li = document.createElement("li");
    const isMuted = await checkTabMuteState(tab.id);
    const iconEmoji = isMuted ? "🔇" : "🔊";
    
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.gap = "4px";
    li.style.padding = "4px 8px";
    li.style.cursor = "pointer";
    
    // 音訊圖示
    const audioIcon = document.createElement("span");
    audioIcon.textContent = iconEmoji;
    li.appendChild(audioIcon);
    
    // 分頁圖示
    if (tab.favIconUrl) {
      const img = document.createElement("img");
      img.src = tab.favIconUrl;
      img.style.width = "16px";
      img.style.height = "16px";
      img.style.flexShrink = "0";
      li.appendChild(img);
    }
    
    // 分頁標題
    const titleSpan = document.createElement("span");
    titleSpan.style.overflow = "hidden";
    titleSpan.style.textOverflow = "ellipsis";
    titleSpan.style.whiteSpace = "nowrap";
    titleSpan.style.flex = "1";
    titleSpan.textContent = tab.title;
    li.appendChild(titleSpan);
    
    li.addEventListener("click", () => handleListItemClick(tab));
    dropdownList.appendChild(li);
  }
}

async function updateSelectedTabInfo(tab) {
  // 檢查分頁的靜音狀態
  const isMuted = await checkTabMuteState(tab.id);
  
  // 智慧處理標題截斷
  const maxLength = 16;
  let displayTitle = tab.title;
  if (tab.title.length > maxLength) {
    // 先取得基本的截斷位置
    let cutIndex = maxLength;
    
    // 向後尋找最近的空白字元（最多往後找 5 個字元）
    const extendedText = tab.title.slice(maxLength, maxLength + 5);
    const nextSpaceIndex = extendedText.indexOf(' ');
    
    // 向前尋找最近的空白字元
    const beforeText = tab.title.slice(0, maxLength);
    const lastSpaceIndex = beforeText.lastIndexOf(' ');
    
    if (nextSpaceIndex !== -1 && nextSpaceIndex < 3) {
      // 如果後面 3 個字元內有空白，就切到那邊
      cutIndex = maxLength + nextSpaceIndex;
    } else if (lastSpaceIndex !== -1 && lastSpaceIndex > maxLength - 5) {
      // 如果前面 5 個字元內有空白，就切在那邊
      cutIndex = lastSpaceIndex;
    }
    
    displayTitle = tab.title.slice(0, cutIndex) + (tab.title.length > cutIndex ? '...' : '');
  }

  selectedTabInfo.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
      <span>狀態：</span>
      <span>${isMuted ? "已靜音 🔇" : "播放中 🔊"}</span>
      ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" style="width: 16px; height: 16px;">` : ''}
      <span style="overflow: hidden; text-overflow: ellipsis;">${displayTitle}</span>
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

// 更新還原按鈕顯示狀態
function updateRestoreButton() {
  // 只要 mutedTabIds 中有任何分頁，就顯示還原按鈕
  restoreButton.classList.toggle('visible', individualMutedTabs.size > 0);
}

// 同步狀態到 storage
async function syncStateToStorage() {
  await chrome.storage.local.set({
    isAllMuted,
    mutedTabIds: Array.from(individualMutedTabs)
  });
  updateRestoreButton();
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
  await updateRestoreButton(); // 初始化時檢查還原按鈕狀態
});

