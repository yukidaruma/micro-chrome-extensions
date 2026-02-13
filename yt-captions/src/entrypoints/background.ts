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
            url: "https://www.youtube.com/watch?*",
          })
          .then(async (tabs) => {
            const [ytTab] = tabs;
            if (ytTab?.id) {
              postToTab(ytTab.id, { type: "INIT" });
              sendResponse({
                destination: "background",
                type: "YT_TAB_FOUND",
                tabId: ytTab.id,
              } satisfies SidePanelOpenResponse);
            }
          });
        return true; // keep sendResponse alive for async .then()

      case "SEEK_VIDEO":
        postToTab(msg.tabId, { type: "SEEK_VIDEO", timeMs: msg.timeMs });
        break;

      case "TOGGLE_SUBTITLES_ON":
        postToTab(msg.tabId, { type: "TOGGLE_SUBTITLES_ON" });
        break;
    }
  });
});
