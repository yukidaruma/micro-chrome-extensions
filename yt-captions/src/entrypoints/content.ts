import { postToInjected, postToPanel } from "@/messages";
import type {
  Caption,
  InjectedMessage,
  BackgroundToTabMessage,
} from "@/messages";

// This type definition is minimal; See https://github.com/lukewarlow/navigation-api-types for complete type definition.
declare global {
  interface Window {
    navigation: {
      addEventListener(type: "currententrychange", listener: () => void): void;
    };
  }
}

export default defineContentScript({
  runAt: "document_start",
  matches: ["*://www.youtube.com/*"], // Match all pages since YouTube is a SPA
  async main() {
    console.log("Content script loaded.");

    let captions: Caption[] = [];
    let videoTitle: string | null = null;
    let hasCaptions: boolean = false;

    await injectScript("/injected.js", {
      keepInDom: true,
    });

    function onNavigation() {
      const isVideo = location.pathname === "/watch";

      if (!isVideo) videoTitle = null;
      captions = [];
      hasCaptions = false;

      postToPanel({ type: "YT_NAVIGATE", isVideo });
    }

    onNavigation();
    window.navigation.addEventListener("currententrychange", onNavigation);

    // From injected script
    window.addEventListener("message", (event) => {
      const msg = event.data as InjectedMessage | undefined;
      if (msg?.destination !== "content") return;

      if (msg.relayToSidePanel) {
        const {
          destination: _destination,
          relayToSidePanel: relay,
          ...body
        } = msg;
        postToPanel(body);
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
      (message: BackgroundToTabMessage, _sender, sendResponse) => {
        switch (message.type) {
          case "SEEK_VIDEO": {
            const video = document.querySelector("video");
            if (video) {
              video.currentTime = message.timeMs / 1000;
            }
            break;
          }
          case "INIT": {
            const isVideo = location.pathname === "/watch";
            postToPanel({ type: "YT_NAVIGATE", isVideo });
            const video = document.querySelector("video");
            const timeMs = video ? video.currentTime * 1000 : undefined;
            postToPanel({
              type: "VIDEO_STATE",
              captions,
              title: videoTitle!,
              hasCaptions,
              timeMs,
            });
            break;
          }
          case "TOGGLE_SUBTITLES_ON":
            postToInjected({ type: "TOGGLE_SUBTITLES_ON" });
            break;
        }
      },
    );
  },
});
