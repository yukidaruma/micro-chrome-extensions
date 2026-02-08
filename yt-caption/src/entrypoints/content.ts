import { sendFromContent as send } from "@/messages";
import type { Caption, InjectedMessage, TabCommand } from "@/messages";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  async main() {
    console.log("Content script loaded.");

    let captions: Caption[] = [];
    let videoTitle = "";

    await injectScript("/injected.js", {
      keepInDom: true,
    });

    function onNavigation() {
      const isVideo = location.pathname === "/watch";
      if (!isVideo) videoTitle = "";
      captions = [];
      send({ type: "VIDEO_CHANGED", isVideo });
    }

    onNavigation();
    document.addEventListener("yt-navigate-start", onNavigation);

    // From injected script
    window.addEventListener("message", (event) => {
      const msg = event.data as InjectedMessage | undefined;
      if (msg?.destination !== "content") return;

      switch (msg.type) {
        case "YT_CAPTIONS":
          videoTitle = msg.videoTitle;
          captions = msg.captions;
          send({ type: "YT_CAPTIONS", captions, videoTitle });
          break;
        case "YT_NO_CAPTIONS":
          send({ type: "YT_NO_CAPTIONS" });
          break;
        case "VIDEO_DETAILS":
          videoTitle = msg.videoTitle;
          send({ type: "VIDEO_DETAILS", videoTitle });
          break;
        case "VIDEO_TIME_UPDATE":
          send({ type: "VIDEO_TIME_UPDATE", timeMs: msg.timeMs });
          break;
      }
    });

    // From side panel
    browser.runtime.onMessage.addListener(
      (message: TabCommand, _sender, sendResponse) => {
        switch (message.type) {
          case "SEEK_VIDEO": {
            const video = document.querySelector("video");
            if (video) {
              video.currentTime = message.timeMs / 1000;
            }
            break;
          }
          case "GET_CAPTIONS":
            console.log("GET_CAPTION", captions);
            sendResponse({ captions, videoTitle });
            break;
          case "TOGGLE_SUBTITLES_ON":
            window.postMessage(
              { type: "TOGGLE_SUBTITLES_ON", destination: "injected" },
              "*",
            );
            break;
        }
      },
    );
  },
});
