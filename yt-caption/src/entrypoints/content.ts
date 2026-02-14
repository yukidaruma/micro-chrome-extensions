/// <reference types="navigation-api-types" />

import logger from "@/logger";
import * as messages from "@/messages";

export default defineContentScript({
  runAt: "document_start",
  matches: ["*://www.youtube.com/*"], // Match all pages since YouTube is a SPA
  async main(ctx) {
    logger.log("Content script loaded.");

    let captions: messages.Caption[] = [];
    let videoTitle: string | null = null;
    let hasCaptions: boolean = false;

    await injectScript("/injected.js", {
      keepInDom: true,
    });

    const testIsVideo = () => location.pathname === "/watch";

    // Workaround for YouTube firing currententrychange twice per navigation
    let lastUrl = "";
    function onNavigation() {
      if (lastUrl === location.href) return;
      lastUrl = location.href;

      const isVideo = testIsVideo();
      if (!isVideo) videoTitle = null;
      captions = [];
      hasCaptions = false;

      messages.postToPanel({ type: "YT_NAVIGATE", isVideo });
    }

    onNavigation();

    ctx.addEventListener(
      window.navigation!,
      "currententrychange",
      onNavigation,
    );

    // Navigating away from YouTube unloads the content script; notify panel before leaving.
    ctx.addEventListener(window, "pagehide", () => {
      messages.postToPanel({ type: "YT_NAVIGATE", isVideo: testIsVideo() });
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

      switch (msg.type) {
        case "VIDEO_STATE":
          if (msg.captions) captions = msg.captions;
          if (msg.title) videoTitle = msg.title;
          if (msg.hasCaptions != null) hasCaptions = msg.hasCaptions;
          break;
      }
    });

    // From side panel
    browser.runtime.onMessage.addListener(
      (message: messages.BackgroundToTabMessage, _sender, sendResponse) => {
        switch (message.type) {
          case "SEEK_VIDEO": {
            const video = document.querySelector("video");
            if (video) {
              video.currentTime = message.timeMs / 1000;
            }
            break;
          }
          case "INIT": {
            const video = document.querySelector("video");
            const payload: messages.ContentMessage = {
              type: "VIDEO_STATE",
              title: videoTitle!,
              hasCaptions,
            };
            if (video) payload.timeMs = video.currentTime * 1000;
            if (captions) payload.captions = captions;

            messages.postToPanel(payload);
            sendResponse(true);
            return;
          }
          case "TOGGLE_SUBTITLES_ON":
            messages.postToInjected({ type: "TOGGLE_SUBTITLES_ON" });
            break;
        }
      },
    );
  },
});
