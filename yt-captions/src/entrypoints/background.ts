import { postToPanel, postToTab } from "@/messages";
import type { PanelMessage } from "@/messages";

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await browser.tabs.get(tabId);
      // tab.url is only populated for YouTube tabs (content script host permissions)
      if (tab.url && new URL(tab.url).hostname === "www.youtube.com") {
        postToPanel({ type: "TAB_ACTIVATED", tabId });
        postToTab(tabId, { type: "INIT" });
      }
    } catch {
      // Tab no longer exists
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    postToPanel({ type: "TAB_REMOVED", tabId });
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.destination !== "background") return;
    const msg = message as PanelMessage;

    switch (msg.type) {
      case "INIT":
        browser.tabs
          .query({ active: true, currentWindow: true })
          .then(async (tabs) => {
            if (!tabs[0]) return;
            const tab = tabs[0];
            const tabId = tab.id;
            const url = tab.url ? new URL(tab.url) : null;
            if (
              url &&
              tabId &&
              url.hostname === "www.youtube.com" &&
              url.pathname === "watch"
            ) {
              postToTab(tabId, { type: "INIT" });
            }
          });
        break;

      case "SEEK_VIDEO":
        postToTab(msg.tabId, { type: "SEEK_VIDEO", timeMs: msg.timeMs });
        break;

      case "TOGGLE_SUBTITLES_ON":
        postToTab(msg.tabId, { type: "TOGGLE_SUBTITLES_ON" });
        break;
    }
  });
});
