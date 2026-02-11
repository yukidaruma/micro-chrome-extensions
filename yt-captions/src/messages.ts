import { browser } from "wxt/browser";

export type Caption = { startMs: number; text: string };

// Strip destination for sender function parameters
type Body<T> = T extends { destination: string }
  ? Omit<T, "destination">
  : never;

// window.postMessage: injected → content
export type InjectedMessage = {
  destination: "content";
  relayToSidePanel?: boolean;
} & (
  | {
      type: "VIDEO_DATA";
      videoTitle?: string;
      hasCaptions?: boolean;
      captions?: Caption[];
    }
  | { type: "VIDEO_TIME_UPDATE"; timeMs: number }
);

// browser.runtime.sendMessage: content → sidepanel
export type ContentMessage = { destination: "sidepanel" } & (
  | {
      type: "VIDEO_DATA";
      videoTitle?: string;
      hasCaptions?: boolean;
      captions?: Caption[];
    }
  | { type: "VIDEO_CHANGED"; isVideo: boolean }
  | { type: "VIDEO_TIME_UPDATE"; timeMs: number }
);

// browser.runtime.sendMessage: sidepanel → background
export type PanelMessage = { destination: "background" } & (
  | { type: "GET_CAPTIONS" }
  | { type: "SEEK_VIDEO"; timeMs: number; tabId: number }
  | { type: "TOGGLE_SUBTITLES_ON"; tabId: number }
);

// browser.runtime.sendMessage: background → sidepanel
export type BackgroundMessage = { destination: "sidepanel" } & (
  | { type: "TAB_ACTIVATED"; tabId: number }
  | { type: "TAB_REMOVED"; tabId: number }
);

// browser.tabs.sendMessage: background → content
export type TabCommand =
  | { type: "SEEK_VIDEO"; timeMs: number }
  | { type: "GET_CAPTIONS" }
  | { type: "TOGGLE_SUBTITLES_ON" };

// GET_CAPTIONS response
export type GetCaptionsResponse = {
  captions: Caption[];
  videoTitle: string;
  activeTabId?: number;
};

// window.postMessage: content → injected
export type InjectedCommand = { destination: "injected" } & {
  type: "TOGGLE_SUBTITLES_ON";
};

// Senders

export function postToInjected(message: Body<InjectedCommand>) {
  window.postMessage({ ...message, destination: "injected" }, location.origin);
}

export function postToContent(message: Body<InjectedMessage>) {
  window.postMessage({ ...message, destination: "content" }, location.origin);
}

// Suppress "Could not establish connection. Receiving end does not exist." errors
// when the destination (sidepanel/background) is not active.

export function postToBackground(message: Body<PanelMessage>) {
  return browser.runtime
    .sendMessage({ ...message, destination: "background" })
    .catch(() => {});
}

export function postToPanel(
  message: Body<ContentMessage> | Body<BackgroundMessage>,
) {
  return browser.runtime
    .sendMessage({ ...message, destination: "sidepanel" })
    .catch(() => {});
}
