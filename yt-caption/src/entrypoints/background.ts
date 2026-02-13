import { postToPanel, postToTab } from "@/messages";
import type { PanelMessage, SidePanelOpenResponse } from "@/messages";

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await browser.tabs.get(tabId);
      // tab.url is only populated for YouTube tabs (content script host permissions)
      if (tab.url && new URL(tab.url).hostname === "www.youtube.com") {
        postToPanel({ type: "YT_TAB_ACTIVATED", tabId });
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
      case "SIDE_PANEL_OPEN":
        browser.tabs
          .query({
            windowId: msg.windowId,
            url: "https://www.youtube.com/*",
          })
          .then(async (tabs) => {
            // Score: /watch=2, active=1
            // 3: active, /watch
            // 2: inactive, /watch
            // 1: active, non-/watch
            // 0: inactive, non-/watch
            const score = (t: Browser.tabs.Tab) =>
              (t.url && new URL(t.url).pathname === "/watch" ? 2 : 0) +
              (t.active ? 1 : 0);
            const sorted = tabs.sort((a, b) => score(b) - score(a));
            const tabIds = sorted.flatMap((t) => (t.id != null ? [t.id] : []));
            if (tabIds.length > 0) {
              postToTab(tabIds[0], { type: "INIT" });
            }
            sendResponse({ tabIds } satisfies SidePanelOpenResponse);
          });
        return true; // keep sendResponse alive for async .then()

      case "SEEK_VIDEO":
      case "TOGGLE_SUBTITLES_ON": {
        const { tabId, destination, ...payload } = msg;
        postToTab(tabId, payload);
        break;
      }
    }
  });
});
