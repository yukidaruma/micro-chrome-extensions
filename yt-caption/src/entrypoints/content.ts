/// <reference types="navigation-api-types" />

import logger from "@/logger";
import * as messages from "@/messages";

export default defineContentScript({
  runAt: "document_start",
  matches: ["*://www.youtube.com/*"], // Match all pages since YouTube is a SPA
  async main(ctx) {
    logger.log("Content script loaded.");

    await injectScript("/injected.js", {
      keepInDom: true,
    });

    const testIsVideo = () => location.pathname === "/watch";

    // Deduplicate navigations: YouTube may fire currententrychange multiple
    // times for the same video (e.g. playlist index param changes).
    let lastVideoKey = "";
    function videoKey() {
      const params = new URLSearchParams(location.search);
      return params.get("v") ?? "";
    }
    function onNavigation(isInitialNavigation?: boolean) {
      const key = videoKey();
      logger.log("onNavigation", { lastVideoKey, key });

      if (lastVideoKey === key) return;
      lastVideoKey = key;

      const isVideo = testIsVideo();

      messages.postToInjected({ type: "RESET_STATE" });
      if (isInitialNavigation) {
        messages.postToBackground({
          type: "YOUTUBE_RELOAD",
        });
      } else {
        messages.postToPanel({ type: "YT_NAVIGATE", isVideo });
      }
    }

    onNavigation(true);

    ctx.addEventListener(window.navigation!, "currententrychange", () => {
      onNavigation();
    });

    // Navigating away from YouTube unloads the content script; notify panel before leaving.
    ctx.addEventListener(window, "pagehide", () => {
      messages.postToBackground({
        type: "YOUTUBE_LEAVE",
      });
    });

    // Handle messages from injected script
    ctx.addEventListener(window, "message", (event) => {
      const msg = event.data as messages.InjectedMessage | undefined;
      if (msg?.destination !== "content") return;

      if (msg.relayToSidePanel) {
        const {
          destination: _destination,
          relayToSidePanel: relay,
          ...body
        } = msg;
        messages.postToPanel(body);
      }
    });

    // From side panel
    browser.runtime.onMessage.addListener(
      (message: messages.BackgroundToTabMessage, _sender, _sendResponse) => {
        switch (message.type) {
          case "SEEK_VIDEO": {
            const video = document.querySelector("video");
            if (video) {
              video.currentTime = message.timeMs / 1000;
            }
            break;
          }
          case "RESTORE_STATE":
          case "TOGGLE_SUBTITLES_ON":
            messages.postToInjected({ type: message.type });
            break;
        }
      },
    );
  },
});
