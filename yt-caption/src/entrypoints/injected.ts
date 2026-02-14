import logger from "@/logger";
import { postToContent } from "@/messages";
import type { InjectedCommand } from "@/messages";

type PlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: unknown[];
    };
  };
  videoDetails?: {
    title?: string;
  };
};

type TimedTextResponse = {
  events?: {
    tStartMs: number;
    dDurationMs: number;
    segs?: { utf8: string }[];
  }[];
};

export default defineUnlistedScript(() => {
  logger.log("Injected script loaded.");

  let videoTitle: string | null = null;
  let activeCaptions: { startMs: number }[] = [];
  let lastCaptionIndex = -1;

  /** Check player response for caption availability and extract title */
  function checkPlayerResponse(data: PlayerResponse) {
    if (data.videoDetails?.title) {
      videoTitle = data.videoDetails.title;
      activeCaptions = [];
      lastCaptionIndex = -1;
      const tracks =
        data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      postToContent({
        type: "VIDEO_STATE",
        title: videoTitle,
        hasCaptions: !!tracks && tracks.length > 0,
        relayToSidePanel: true,
      });
    }
  }

  const interceptors: Array<{
    match: string;
    handle: (body: unknown) => void;
  }> = [
    {
      match: "/get_watch",
      handle(body) {
        checkPlayerResponse(
          (
            body as [
              {
                playerResponse: PlayerResponse;
              },
            ]
          )?.[0].playerResponse,
        );
      },
    },
    {
      match: "/timedtext",
      handle(body) {
        // Prevent prefetched captions from appearing in side panel (e.g. from search result page)
        if (location.pathname !== "/watch") return;

        const root = body as TimedTextResponse;
        if (!root.events) return;

        const captions = root.events
          .filter((e) => e.segs && e.segs.length > 0)
          .map((e) => ({
            startMs: e.tStartMs,
            text: e.segs!.map((s) => s.utf8).join(""),
          }))
          .filter((c) => c.text.trim().length > 0);

        if (captions.length > 0) {
          activeCaptions = captions;
          lastCaptionIndex = -1;
          postToContent({
            type: "VIDEO_STATE",
            captions,
            relayToSidePanel: true,
          });
        }
      },
    },
  ];

  let _ytInitial = (window as unknown as Record<string, unknown>)
    .ytInitialPlayerResponse as PlayerResponse | undefined;
  if (_ytInitial) {
    checkPlayerResponse(_ytInitial);
  } else {
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get() {
        return _ytInitial;
      },
      set(value: PlayerResponse) {
        _ytInitial = value;
        checkPlayerResponse(value);
      },
    });
  }

  // Fetch
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await originalFetch(...args);
    const url =
      args[0] instanceof Request ? args[0].url : args[0]?.toString() || "";

    const interceptor = interceptors.find((i) => url.includes(i.match));
    if (interceptor) {
      response.clone().json().then(interceptor.handle);
    }

    return response;
  };

  // XHR
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    this.addEventListener("load", function () {
      const interceptor = interceptors.find((i) =>
        this.responseURL.includes(i.match),
      );
      if (!interceptor) return;

      try {
        interceptor.handle(JSON.parse(this.responseText));
      } catch {}
    });

    return originalSend.call(this, body);
  };

  // Listen for commands from content script
  window.addEventListener("message", (event) => {
    const msg = event.data as InjectedCommand | undefined;
    if (msg?.destination !== "injected") return;

    switch (msg.type) {
      case "TOGGLE_SUBTITLES_ON": {
        const player = document.getElementById("movie_player") as
          | (HTMLElement & {
              toggleSubtitlesOn?: () => void;
            })
          | null;
        player?.toggleSubtitlesOn?.();
        break;
      }
    }
  });

  // Track video time and send updates only when the active caption changes
  function findCaptionIndex(timeMs: number): number {
    if (activeCaptions.length === 0) return -1;
    let idx = -1;
    for (let i = activeCaptions.length - 1; i >= 0; i--) {
      if (activeCaptions[i].startMs <= timeMs) {
        idx = i;
        break;
      }
    }
    return idx;
  }

  function attachTimeTracking(video: HTMLVideoElement) {
    video.addEventListener("timeupdate", () => {
      const timeMs = Math.round(video.currentTime * 1000);
      const idx = findCaptionIndex(timeMs);
      if (idx === lastCaptionIndex) return;
      lastCaptionIndex = idx;
      postToContent({
        type: "VIDEO_STATE",
        timeMs,
        relayToSidePanel: true,
      });
    });
  }

  const existing = document.querySelector("video");
  if (existing) {
    attachTimeTracking(existing);
  } else {
    const observer = new MutationObserver((_mutations, obs) => {
      const video = document.querySelector("video");
      if (video) {
        attachTimeTracking(video);
        obs.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
});
