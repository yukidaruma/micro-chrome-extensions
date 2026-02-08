import { browser } from "wxt/browser";

export type Caption = { startMs: number; text: string };

// Strip destination for sender function parameters
type Body<T> = T extends { destination: string }
  ? Omit<T, "destination">
  : never;

// window.postMessage: injected → content
export type InjectedMessage = { destination: "content" } & (
  | { type: "YT_CAPTIONS"; captions: Caption[]; videoTitle: string }
  | { type: "YT_NO_CAPTIONS" }
  | { type: "VIDEO_DETAILS"; videoTitle: string }
  | { type: "VIDEO_TIME_UPDATE"; timeMs: number }
);

// browser.runtime.sendMessage: content → background
export type ContentMessage = { destination: "background" } & (
  | { type: "YT_CAPTIONS"; captions: Caption[]; videoTitle: string }
  | { type: "YT_NO_CAPTIONS" }
  | { type: "VIDEO_DETAILS"; videoTitle: string }
  | { type: "VIDEO_CHANGED"; isVideo: boolean }
  | { type: "VIDEO_TIME_UPDATE"; timeMs: number }
);

// browser.runtime.sendMessage: background → sidepanel
export type PanelMessage = { destination: "sidepanel" } & (
  | {
      type: "YT_CAPTIONS";
      captions: Caption[];
      videoTitle: string;
      tabId: number;
    }
  | { type: "YT_NO_CAPTIONS"; tabId: number }
  | { type: "VIDEO_DETAILS"; videoTitle: string; tabId: number }
  | {
      type: "VIDEO_CHANGED";
      isVideo: boolean;
      tabId: number;
    }
  | { type: "VIDEO_TIME_UPDATE"; timeMs: number; tabId: number }
  | { type: "TAB_ACTIVATED"; tabId: number }
  | { type: "TAB_REMOVED"; tabId: number }
);

// browser.runtime.sendMessage: sidepanel → background
export type PanelRequest = { destination: "background" } & (
  | { type: "GET_CAPTIONS" }
  | { type: "SEEK_VIDEO"; timeMs: number; tabId: number }
  | { type: "TOGGLE_SUBTITLES_ON"; tabId: number }
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
export type ContentToInjectedMessage = { destination: "injected" } & {
  type: "TOGGLE_SUBTITLES_ON";
};

// Senders

export function postInjected(message: Body<InjectedMessage>) {
  window.postMessage({ ...message, destination: "content" }, "*");
}

export function sendFromContent(message: Body<ContentMessage>) {
  return browser.runtime.sendMessage({ ...message, destination: "background" });
}

export function sendFromPanel(message: Body<PanelRequest>) {
  return browser.runtime.sendMessage({ ...message, destination: "background" });
}

export function relayToPanel(message: Body<PanelMessage>) {
  return browser.runtime.sendMessage({ ...message, destination: "sidepanel" });
}
