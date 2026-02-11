import { postToPanel } from "@/messages";
import type { GetCaptionsResponse, PanelMessage, TabCommand } from "@/messages";

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await browser.tabs.get(tabId);
      // tab.url is only populated for YouTube tabs (content script host permissions)
      if (tab.url?.includes("youtube.com/")) {
        postToPanel({ type: "TAB_ACTIVATED", tabId });
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
      case "GET_CAPTIONS":
        browser.tabs
          .query({ active: true, currentWindow: true })
          .then(async (tabs) => {
            const activeTabId = tabs[0]?.id;
            const res: GetCaptionsResponse = {
              captions: [],
              videoTitle: "",
              activeTabId,
            };
            if (activeTabId) {
              try {
                const data = await browser.tabs.sendMessage(activeTabId, {
                  type: "GET_CAPTIONS",
                } satisfies TabCommand);
                res.captions = data.captions ?? [];
                res.videoTitle = data.videoTitle ?? "";
              } catch {
                // Content script not available (non-YouTube tab)
              }
            }
            (sendResponse as (r: GetCaptionsResponse) => void)(res);
          });
        return true;

      case "SEEK_VIDEO":
        browser.tabs.sendMessage(msg.tabId, {
          type: "SEEK_VIDEO",
          timeMs: msg.timeMs,
        } satisfies TabCommand);
        break;

      case "TOGGLE_SUBTITLES_ON":
        browser.tabs.sendMessage(msg.tabId, {
          type: "TOGGLE_SUBTITLES_ON",
        } satisfies TabCommand);
        break;
    }
  });
});
