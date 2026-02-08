import { postInjected as post } from "@/messages";

declare global {
  interface XMLHttpRequest {
    _interceptedUrl?: string;
  }
}

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
  let videoTitle = "";

  /** Check player response for caption availability and extract title */
  function checkPlayerResponse(data: PlayerResponse) {
    if (data.videoDetails?.title) {
      videoTitle = data.videoDetails.title;
      post({ type: "VIDEO_DETAILS", videoTitle });
    }

    const tracks =
      data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) {
      post({ type: "YT_NO_CAPTIONS" });
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
          post({ type: "YT_CAPTIONS", captions, videoTitle });
        }
      },
    },
  ];

  let _ytInitial = (window as unknown as Record<string, unknown>)
    .ytInitialPlayerResponse as PlayerResponse | undefined;
  if (_ytInitial) {
    checkPlayerResponse(_ytInitial);
  }
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

  // Fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = args[0]?.toString() || "";
    const interceptor = interceptors.find((i) => url.includes(i.match));
    if (interceptor) {
      response
        .clone()
        .json()
        .then((body) => interceptor.handle(body));
    }
    return response;
  };

  // XHR
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    this._interceptedUrl = url.toString();
    return originalOpen.call(
      this,
      method,
      url,
      async ?? true,
      username,
      password,
    );
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const interceptor = interceptors.find((i) =>
      (this._interceptedUrl || "").includes(i.match),
    );
    if (interceptor) {
      this.addEventListener("load", function () {
        try {
          interceptor.handle(JSON.parse(this.responseText));
        } catch {
          interceptor.handle(this.responseText);
        }
      });
    }

    return originalSend.call(this, body);
  };

  // Listen for commands from content script
  window.addEventListener("message", (event) => {
    const msg = event.data as
      | { destination?: string; type?: string }
      | undefined;
    if (msg?.destination !== "injected") return;
    if (msg.type === "TOGGLE_SUBTITLES_ON") {
      const player = document.getElementById("movie_player") as
        | (HTMLElement & {
            toggleSubtitlesOn?: () => void;
          })
        | null;
      player?.toggleSubtitlesOn?.();
    }
  });

  // Track video time and send throttled updates via postMessage
  let lastSentTime = 0;
  function attachTimeTracking(video: HTMLVideoElement) {
    video.addEventListener("timeupdate", () => {
      const now = Date.now();
      if (now - lastSentTime < 100) return;
      lastSentTime = now;
      const timeMs = Math.round(video.currentTime * 1000);
      post({ type: "VIDEO_TIME_UPDATE", timeMs });
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
