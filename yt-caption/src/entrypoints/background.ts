import logger from "@/logger";
import { postToPanel, postToTab } from "@/messages";
import type { PanelMessage } from "@/messages";

export default defineBackground(() => {
  logger.log("Content script loaded.");

  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  /**
   * Query YT tabs in a window, score them, INIT the best one, and notify the panel.
   * @param initAll - INIT all /watch tabs so they sync state to the panel.
   */
  async function activateYtTabs(windowId: number, initAll = false) {
    const tabs = await browser.tabs.query({
      windowId,
      url: "https://www.youtube.com/*",
    });
    // 3: active (current tab), /watch
    // 2: active, non-/watch
    // 1: inactive, /watch
    // 0: inactive, non-/watch
    const score = (t: Browser.tabs.Tab) =>
      (t.active ? 2 : 0) +
      (t.url && new URL(t.url).pathname === "/watch" ? 1 : 0);
    const sorted = tabs.sort((a, b) => score(b) - score(a));
    const topScore = sorted.length > 0 ? score(sorted[0]) : -1;

    // On a tie, send all candidates so the panel can prioritize one with existing caption data.
    // Practically, ties only occur at score 1 (multiple inactive /watch tabs).
    const tabIds = sorted
      .filter((t) => score(t) === topScore)
      .flatMap((t) => (t.id ? [t.id] : []));
    if (tabIds.length > 0) {
      if (initAll) {
        await Promise.all(
          sorted
            .filter((t) => t.id && t.url && new URL(t.url).pathname === "/watch")
            .map((t) => postToTab(t.id!, { type: "INIT" })),
        );
      } else {
        await postToTab(tabIds[0], { type: "INIT" });
      }
      postToPanel({ type: "TAB_ACTIVATED", tabIds });
    }
  }

  // Tab closing has two cases:
  // 1. Closing the active tab - Chrome activates another tab, so onActivated fires.
  // 2. Closing a background tab - onActivated does NOT fire, so onRemoved handles it.
  browser.tabs.onActivated.addListener(async ({ windowId }) => {
    try {
      await activateYtTabs(windowId);
    } catch {}
  });
  browser.tabs.onRemoved.addListener(async (tabId, { windowId }) => {
    postToPanel({ type: "TAB_REMOVED", tabId });
    activateYtTabs(windowId);
  });

  browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message.destination !== "background") return;
    const msg = message as PanelMessage;

    switch (msg.type) {
      case "SIDE_PANEL_OPEN":
        activateYtTabs(msg.windowId, true);
        break;

      case "SEEK_VIDEO":
      case "TOGGLE_SUBTITLES_ON": {
        const { tabId, destination, ...payload } = msg;
        postToTab(tabId, payload);
        break;
      }
    }
  });
});
