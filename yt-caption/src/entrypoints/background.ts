import { relayToPanel } from "@/messages";
import type {
  ContentMessage,
  GetCaptionsResponse,
  PanelRequest,
  TabCommand,
} from "@/messages";

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    relayToPanel({ type: "TAB_ACTIVATED", tabId });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    relayToPanel({ type: "TAB_REMOVED", tabId });
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.destination !== "background") return;
    const msg = message as ContentMessage | PanelRequest;
    const tabId = sender.tab?.id;

    switch (msg.type) {
      case "YT_CAPTIONS":
      case "VIDEO_CHANGED":
      case "VIDEO_DETAILS":
      case "YT_NO_CAPTIONS":
      case "VIDEO_TIME_UPDATE":
        if (tabId) {
          relayToPanel({ ...msg, tabId });
        }
        break;

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
