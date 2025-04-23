// popup.js

let mutedTabIds = new Set();
let isAllMuted = false;

document.addEventListener("DOMContentLoaded", async () => {
  const globalMuteToggle = document.getElementById("globalMuteToggle");
  const toggleSelectedBtn = document.getElementById("toggleSelected");
  const toggleCurrentBtn = document.getElementById("toggleCurrent");
  // const tabSelect = document.getElementById("tabSelect");
  const selectedTabInfo = document.getElementById("selectedTabInfo");
  const dropdownButton   = document.getElementById("dropdownButton");
  const dropdownList     = document.getElementById("dropdownList");
  let selectedTabId = null;   // 新增：紀錄被選中的 Tab ID

  dropdownButton.addEventListener("click", () => {
    dropdownList.classList.toggle("hidden");
  });
  // 初始化：讀取 storage 狀態
  const initState = async () => {
    const storage = await chrome.storage.local.get(["mutedTabIds", "isAllMuted"]);
    mutedTabIds = new Set(storage.mutedTabIds || []);
    isAllMuted = storage.isAllMuted || false;

    globalMuteToggle.checked = isAllMuted;
    // await updateTabList();
    await renderDropdownList();
    await updateCurrentMuteButton();
  };

  // 全域靜音開關事件
  globalMuteToggle.addEventListener("change", async () => {
    isAllMuted = globalMuteToggle.checked;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      await chrome.tabs.update(tab.id, { muted: isAllMuted });
      if (isAllMuted) mutedTabIds.add(tab.id);
      else mutedTabIds.delete(tab.id);
    }
    chrome.storage.local.set({ isAllMuted, mutedTabIds: Array.from(mutedTabIds) });
  });
  // const updateToggleAllButton = () => {
  //   const buttonText = isAllMuted ? "全部取消靜音" : "全部靜音";
  //   const buttonSpan = toggleAllBtn.querySelector('span:not(.button-icon)');
  //   buttonSpan.textContent = buttonText;
  //   toggleAllBtn.classList.toggle("muted", isAllMuted);
  //   toggleAllBtn.classList.toggle("unmuted", !isAllMuted);
  //   toggleAllBtn.classList.toggle("neutral", false);
  //   const iconSpan = toggleAllBtn.querySelector('.button-icon');
  //   iconSpan.textContent = isAllMuted ? "🔇" : "🔊";
  // };

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


    /** 新增：以 <ul><li> 形式渲染自訂分頁清單 **/
  async function renderDropdownList() {
    const tabs = await chrome.tabs.query({});
    dropdownList.innerHTML = "";
    tabs.forEach(tab => {
      const li = document.createElement("li");
      const iconEmoji = tab.mutedInfo?.muted ? "🔇" : "🔊";
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
      t.textContent = tab.title.slice(0,40);
      li.appendChild(t);
      // 點擊選擇
      li.addEventListener("click", () => {
        selectedTabId = tab.id;
        dropdownButton.textContent = `${iconEmoji} ${tab.title.slice(0,20)} ▾`;
        // dropdownList.classList.add("hidden");
        selectedTabInfo.textContent = `狀態：${tab.mutedInfo?.muted ? "已靜音 🔇" : "播放中 🔊"}`;
      });
      dropdownList.appendChild(li);
    });
  }

  // 「全部靜音 / 取消靜音」按鈕
  // toggleAllBtn.addEventListener("click", async () => {
  //   isAllMuted = !isAllMuted;
  //   const tabs = await chrome.tabs.query({});
  //   for (const tab of tabs) {
  //     await chrome.tabs.update(tab.id, { muted: isAllMuted });
  //     if (isAllMuted) {
  //       mutedTabIds.add(tab.id);
  //     } else {
  //       mutedTabIds.delete(tab.id);
  //     }
  //   }
  //   chrome.storage.local.set({
  //     isAllMuted,
  //     mutedTabIds: Array.from(mutedTabIds),
  //   });

  //   updateToggleAllButton();
  //   await renderDropdownList();      // ←改成自訂清單
  //   await updateCurrentMuteButton();
  // });

 

  toggleSelectedBtn.addEventListener("click", async () => {
      if (!selectedTabId) return;
      const tab = await chrome.tabs.get(selectedTabId);
      const newMuted = !tab.mutedInfo?.muted;
      await chrome.tabs.update(selectedTabId, { muted: newMuted });
      if (newMuted) mutedTabIds.add(selectedTabId);
      else mutedTabIds.delete(selectedTabId);
      chrome.storage.local.set({ mutedTabIds: Array.from(mutedTabIds) });
      await renderDropdownList();        // 重新渲染清單
      await updateCurrentMuteButton();    // 更新按鈕狀態
      // dropdownList.classList.remove("hidden");  // ← 加回來，保持清單開啟

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
    // await updateTabList();
    await renderDropdownList();
    await updateCurrentMuteButton();
  });

  // 初始化
  await initState();
});
