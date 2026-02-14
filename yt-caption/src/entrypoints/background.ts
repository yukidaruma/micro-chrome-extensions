import logger from "@/logger";
import * as messages from "@/messages";

export default defineBackground(() => {
  logger.log("Content script loaded.");

  /**
   * Query YouTube tabs in a window, restore the best ones, and notify the panel.
   * @param restoreAll - Restore all /watch tabs so they sync state to the panel.
   */
  async function activateYtTabs(restoreState = false) {
    const tabs = await browser.tabs.query({
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
    // For tabs of same score, leftmost tabs are prioritized.
    const tabIds = sorted
      .filter((t) => score(t) === topScore)
      .flatMap((t) => (t.id ? [t.id] : []));
    if (tabIds.length > 0) {
      if (restoreState) {
        const watchTabs = sorted.filter(
          (t) => t.id && t.url && new URL(t.url).pathname === "/watch",
        );
        if (watchTabs.length > 0) {
          await Promise.all(
            watchTabs.map((t) =>
              messages.postToTab(t.id!, { type: "RESTORE_STATE" }),
            ),
          );
        }
      }
    }
    return messages.postToPanel({ type: "TAB_ACTIVATED", tabIds });
  }

  // Tab closing has two cases:
  // 1. Closing the active tab - Chrome activates another tab, so onActivated fires.
  // 2. Closing a background tab - onActivated does NOT fire, so onRemoved needs to fire it.
  browser.tabs.onActivated.addListener(() => {
    activateYtTabs();
  });
  browser.tabs.onCreated.addListener(() => {
    activateYtTabs();
  });
  browser.tabs.onRemoved.addListener((tabId, _removeInfo) => {
    messages.postToPanel({ type: "TAB_REMOVED", tabId });
    activateYtTabs();
  });

  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  browser.sidePanel.onOpened.addListener(async ({ windowId }) => {
    // Close our side panel in other windows (doesn't affect other extensions).
    // State restore is done in Svelte onMount to avoid race condition.
    const allWindows = await browser.windows.getAll();
    for (const win of allWindows) {
      if (win.id != null && win.id !== windowId) {
        browser.sidePanel.close({ windowId: win.id });
      }
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.destination !== "background") return;
    const msg = message as messages.PanelMessage;

    switch (msg.type) {
      case "YOUTUBE_RELOAD":
        messages.postToPanel({
          type: "VIDEO_STATE",
          isVideo: true,
          isLoading: true,
        });
        break;

      case "YOUTUBE_LEAVE":
        activateYtTabs();
        break;

      case "SIDE_PANEL_OPEN":
        activateYtTabs(true).then(sendResponse);
        return true; // keep message channel open

      case "SEEK_VIDEO":
      case "TOGGLE_SUBTITLES_ON": {
        const { tabId, destination, ...payload } = msg;
        messages.postToTab(tabId, payload);
        break;
      }
    }
  });
});
