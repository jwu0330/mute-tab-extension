// popup.js

// 全域狀態變數
let isAllMuted = false;
let individualMutedTabs = new Set();
let selectedTabId = null;

// DOM 元素
let globalMuteToggle;
let toggleCurrentBtn;
let selectedAudioSwitch;
let selectedAudioIcon;
let selectedAudioLabel;
let dropdownButton;
let dropdownList;
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
  applyStoredState(storage);
}

function applyStoredState(storage) {
  if (storage.mutedTabIds) {
    individualMutedTabs = new Set(storage.mutedTabIds);
  }
  if (typeof storage.isAllMuted !== "undefined") {
    isAllMuted = storage.isAllMuted;
  }
  if (globalMuteToggle) {
    globalMuteToggle.checked = isAllMuted;
  }
}

function setupEventListeners() {
  globalMuteToggle.addEventListener("change", handleGlobalMuteChange);
  selectedAudioSwitch.addEventListener("click", handleSelectedTabAudioSwitch);
  toggleCurrentBtn.addEventListener("click", handleCurrentTabMute);
  dropdownButton.addEventListener("click", () => {
    const isHidden = dropdownList.classList.toggle("hidden");
    dropdownButton.parentElement.classList.toggle("open", !isHidden);
    if (!isHidden) {
      renderDropdownList(); // 重新渲染列表以確保狀態最新
    }
  });
  dialogConfirm.addEventListener("click", handleRestoreConfirm);
  dialogCancel.addEventListener("click", hideRestoreDialog);
  chrome.storage.onChanged.addListener(handleStorageChanged);
}

async function handleStorageChanged(changes, area) {
  if (area !== "local") return;

  const nextState = {};
  if (changes.mutedTabIds) {
    nextState.mutedTabIds = changes.mutedTabIds.newValue || [];
  }
  if (changes.isAllMuted) {
    nextState.isAllMuted = !!changes.isAllMuted.newValue;
  }

  applyStoredState(nextState);
  await updateUIStates();
}

// 靜音控制相關
async function handleGlobalMuteChange() {
  const shouldEnableGlobalMute = globalMuteToggle.checked;
  if (!shouldEnableGlobalMute && isAllMuted) {
    globalMuteToggle.checked = true;
    showRestoreDialog();
    return;
  }

  isAllMuted = shouldEnableGlobalMute;
  if (isAllMuted) {
    await syncStateToStorage({ isAllMuted: true });
  }

  const tabs = await chrome.tabs.query({});

  if (isAllMuted) {
    const tabIds = tabs
      .map((tab) => tab.id)
      .filter((tabId) => typeof tabId === "number");
    tabIds.forEach((tabId) => {
      individualMutedTabs.add(tabId);
    });
    await syncStateToStorage({ addTabIds: tabIds, isAllMuted: true });
    await Promise.all(tabIds.map((tabId) =>
      chrome.tabs.update(tabId, { muted: true }).catch(() => {})
    ));
  }

  await updateUIStates();
}

async function handleCurrentTabMute() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") return;
  
  const currentMuted = await checkTabMuteState(tab.id);
  const newMuted = !currentMuted;
  if (isAllMuted && !newMuted) {
    showRestoreDialog();
    return;
  }
  
  // 進到這裡代表 isAllMuted=false 或 newMuted=true；isAllMuted=true 且解除單頁的情況上面已被
  // showRestoreDialog 攔下，不需要在此重置全域靜音狀態。
  if (newMuted) {
    individualMutedTabs.add(tab.id);
  } else {
    individualMutedTabs.delete(tab.id);
  }

  await syncStateToStorage({
    addTabIds: newMuted ? [tab.id] : [],
    removeTabIds: newMuted ? [] : [tab.id],
    isAllMuted,
  });
  let updatedTab = null;
  try {
    updatedTab = await chrome.tabs.update(tab.id, { muted: newMuted });
  } catch (error) {
    console.warn("Failed to update current tab mute state:", error);
  }
  await updateUIStates();
}

async function handleSelectedTabAudioSwitch() {
  if (!selectedTabId) {
    updateSelectedAudioControl(false, false);
    return;
  }
  
  const tab = await getTabOrClearSelection(selectedTabId);
  if (!tab) {
    updateSelectedAudioControl(false, false);
    return;
  }

  const currentMuted = await checkTabMuteState(selectedTabId);
  const newMuted = !currentMuted;
  if (isAllMuted && !newMuted) {
    await updateSelectedAudioControl(true, true);
    showRestoreDialog();
    return;
  }
  
  // 同上：isAllMuted=true 且解除單頁的情況已被 showRestoreDialog 攔下，這裡不必重置全域靜音。
  if (newMuted) {
    individualMutedTabs.add(selectedTabId);
  } else {
    individualMutedTabs.delete(selectedTabId);
  }

  await syncStateToStorage({
    addTabIds: newMuted ? [selectedTabId] : [],
    removeTabIds: newMuted ? [] : [selectedTabId],
    isAllMuted,
  });
  let updatedTab = null;
  try {
    updatedTab = await chrome.tabs.update(selectedTabId, { muted: newMuted });
  } catch (error) {
    console.warn("Failed to update selected tab mute state:", error);
  }

  // 更新顯示
  await updateDropdownButtonDisplay(updatedTab || tab);
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

  // 先寫回 storage，避免 background 看到的 mutedTabIds 還是舊資料而把分頁打回靜音
  await syncStateToStorage({ clearAll: true });

  // 並行解除所有分頁靜音；逐個容錯，避免任一分頁剛被關閉就讓整批 reject
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) =>
    typeof tab.id === "number"
      ? chrome.tabs.update(tab.id, { muted: false }).catch(() => {})
      : Promise.resolve()
  ));

  await updateUIStates();
}

// UI 更新相關
async function updateUIStates() {
  await updateButtonStates();
  if (dropdownList && !dropdownList.classList.contains("hidden")) {
    await renderDropdownList();
  }
}

async function updateButtonStates() {
  globalMuteToggle.checked = isAllMuted;

  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab) return;

  // 使用統一的狀態檢查函數
  const currentTabMuteState = await checkTabMuteState(currentTab.id);

  // 更新當前分頁按鈕狀態
  updateCurrentButtonState(toggleCurrentBtn, currentTabMuteState);
  
  // 如果有選中的分頁，更新其狀態
  if (selectedTabId) {
    const selectedTab = await getTabOrClearSelection(selectedTabId);
    if (selectedTab) {
      const selectedTabMuteState = await checkTabMuteState(selectedTabId);
      updateSelectedAudioControl(selectedTabMuteState, true);
      await updateDropdownButtonDisplay(selectedTab);
    } else {
      updateSelectedAudioControl(false, false);
    }
  } else {
    updateSelectedAudioControl(false, false);
  }
}

async function getTabOrClearSelection(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    if (selectedTabId === tabId) {
      selectedTabId = null;
      resetDropdownButtonDisplay();
      dropdownButton.parentElement.classList.remove("open");
    }
    console.warn("Selected tab is no longer available:", error);
    return null;
  }
}

function updateCurrentButtonState(button, isMuted) {
  const buttonText = isMuted ? "當前分頁靜音" : "當前分頁";
  const buttonSpan = button.querySelector('span:not(.button-icon)');
  buttonSpan.textContent = buttonText;
  
  button.classList.remove("muted", "unmuted", "neutral");
  button.classList.add(isMuted ? "muted" : "unmuted");
  
  const iconSpan = button.querySelector('.button-icon');
  iconSpan.textContent = isMuted ? "🔇" : "▶️";
}

function updateSelectedAudioControl(isMuted, hasSelection) {
  selectedAudioSwitch.disabled = !hasSelection;
  selectedAudioSwitch.setAttribute("aria-checked", String(hasSelection && !isMuted));
  selectedAudioSwitch.title = hasSelection ? "分頁播放/靜音" : "請先選擇分頁";
  selectedAudioIcon.textContent = isMuted ? "🔇" : "🔊";
  selectedAudioLabel.textContent = isMuted ? "分頁靜音" : "分頁播放";

  selectedAudioSwitch.classList.toggle("disabled", !hasSelection);
  selectedAudioSwitch.classList.toggle("muted", hasSelection && isMuted);
  selectedAudioSwitch.classList.toggle("unmuted", hasSelection && !isMuted);
}

// 新增：更新下拉按鈕顯示的輔助函數
async function updateDropdownButtonDisplay(tab) {
  const isMuted = await checkTabMuteState(tab.id);
  const iconEmoji = isMuted ? "🔇" : "🔊";
  
  const buttonContent = document.createElement("div");
  buttonContent.className = "dropdown-button-content";
  
  // 音訊圖示
  const audioIcon = document.createElement("span");
  audioIcon.className = "dropdown-audio-slot";
  audioIcon.textContent = iconEmoji;
  buttonContent.appendChild(audioIcon);
  
  // 分頁圖示
  const faviconSlot = document.createElement("span");
  faviconSlot.className = "dropdown-favicon-slot";
  if (tab.favIconUrl && /^(https?:|data:image\/)/i.test(tab.favIconUrl)) {
    const img = document.createElement("img");
    img.src = tab.favIconUrl;
    faviconSlot.appendChild(img);
  }
  buttonContent.appendChild(faviconSlot);

  // 分頁標題
  const titleSpan = document.createElement("span");
  titleSpan.className = "dropdown-title";
  titleSpan.textContent = tab.title || "";
  buttonContent.appendChild(titleSpan);
  
  // 下拉箭頭
  const arrow = document.createElement("span");
  arrow.className = "dropdown-arrow";
  arrow.textContent = "▾";
  buttonContent.appendChild(arrow);
  
  dropdownButton.innerHTML = '';
  dropdownButton.appendChild(buttonContent);
}

function resetDropdownButtonDisplay() {
  dropdownButton.replaceChildren();

  const buttonContent = document.createElement("div");
  buttonContent.className = "dropdown-button-content";

  const audioSlot = document.createElement("span");
  audioSlot.className = "dropdown-audio-slot";
  buttonContent.appendChild(audioSlot);

  const faviconSlot = document.createElement("span");
  faviconSlot.className = "dropdown-favicon-slot";
  buttonContent.appendChild(faviconSlot);

  const titleSpan = document.createElement("span");
  titleSpan.className = "dropdown-title";
  titleSpan.textContent = "選擇分頁";
  buttonContent.appendChild(titleSpan);

  const arrow = document.createElement("span");
  arrow.className = "dropdown-arrow";
  arrow.textContent = "▾";
  buttonContent.appendChild(arrow);

  dropdownButton.appendChild(buttonContent);
}

// 點擊列表項目時的處理
async function handleListItemClick(tab) {
  selectedTabId = tab.id;
  await updateDropdownButtonDisplay(tab);
  await updateButtonStates();
  await renderDropdownList();
}

// 更新渲染下拉列表
async function renderDropdownList() {
  const tabs = await chrome.tabs.query({});
  dropdownList.innerHTML = "";
  
  for (const tab of tabs) {
    const li = document.createElement("li");
    const isMuted = await checkTabMuteState(tab.id);
    const iconEmoji = isMuted ? "🔇" : "🔊";
    li.classList.toggle("selected", tab.id === selectedTabId);
    
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.gap = "4px";
    li.style.padding = "4px 8px";
    li.style.cursor = "pointer";
    
    // 音訊圖示
    const audioIcon = document.createElement("span");
    audioIcon.textContent = iconEmoji;
    audioIcon.style.flexShrink = "0";
    li.appendChild(audioIcon);
    
    // 分頁圖示
    if (tab.favIconUrl && /^(https?:|data:image\/)/i.test(tab.favIconUrl)) {
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
    titleSpan.style.minWidth = "0";
    titleSpan.textContent = tab.title || "";
    li.appendChild(titleSpan);
    
    li.addEventListener("click", () => handleListItemClick(tab));
    dropdownList.appendChild(li);
  }
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

// 同步狀態到 storage
async function syncStateToStorage({
  addTabIds = [],
  removeTabIds = [],
  clearAll = false,
  isAllMuted: nextIsAllMuted = isAllMuted,
} = {}) {
  const response = await chrome.runtime.sendMessage({
    type: "syncMuteState",
    addTabIds,
    removeTabIds,
    clearAll,
    isAllMuted: clearAll ? false : nextIsAllMuted,
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Failed to sync mute state");
  }

  applyStoredState(response.state);
  return response.state;
}

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
  // 獲取 DOM 元素
  globalMuteToggle = document.getElementById("globalMuteToggle");
  toggleCurrentBtn = document.getElementById("toggleCurrent");
  selectedAudioSwitch = document.getElementById("selectedAudioSwitch");
  selectedAudioIcon = document.getElementById("selectedAudioIcon");
  selectedAudioLabel = document.getElementById("selectedAudioLabel");
  dropdownButton = document.getElementById("dropdownButton");
  dropdownList = document.getElementById("dropdownList");
  customDialog = document.getElementById("customDialog");
  dialogConfirm = document.getElementById("dialogConfirm");
  dialogCancel = document.getElementById("dialogCancel");
  
  // 初始化狀態
  await initializeState();
});
