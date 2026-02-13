import logger from "@/logger";
import { browser } from "wxt/browser";

export type Caption = { startMs: number; text: string };

// Strip destination for sender function parameters
type Body<T> = T extends { destination: string }
  ? Omit<T, "destination">
  : never;

// window.postMessage: injected -> content
export type InjectedMessage = {
  destination: "content";
  relayToSidePanel?: boolean;
  type: "VIDEO_STATE";
  title?: string;
  hasCaptions?: boolean;
  captions?: Caption[];
  timeMs?: number;
};

// browser.runtime.sendMessage: content -> sidepanel
export type ContentMessage = { destination: "sidepanel" } & (
  | {
      type: "VIDEO_STATE";
      title?: string;
      hasCaptions?: boolean;
      captions?: Caption[];
      timeMs?: number;
    }
  | { type: "YT_NAVIGATE"; isVideo: boolean }
);

// browser.runtime.sendMessage: sidepanel -> background
export type PanelMessage = { destination: "background" } & (
  | { type: "SIDE_PANEL_OPEN"; windowId: number }
  | { type: "SEEK_VIDEO"; timeMs: number; tabId: number }
  | { type: "TOGGLE_SUBTITLES_ON"; tabId: number }
);

// browser.runtime.sendMessage: background -> sidepanel
export type BackgroundToPanelMessage = { destination: "sidepanel" } & (
  | { type: "YT_TAB_ACTIVATED"; tabId: number }
  | { type: "TAB_REMOVED"; tabId: number }
);

// sendResponse: background -> sidepanel (response to OPEN)
export type SidePanelOpenResponse = {
  tabIds: number[];
};

// browser.tabs.sendMessage: background -> content
export type BackgroundToTabMessage =
  | { type: "SEEK_VIDEO"; timeMs: number }
  | { type: "INIT" }
  | { type: "TOGGLE_SUBTITLES_ON" };

// window.postMessage: content -> injected
export type InjectedCommand = { destination: "injected" } & {
  type: "TOGGLE_SUBTITLES_ON";
};

// Senders

export function postToInjected(message: Body<InjectedCommand>) {
  logger.debug("-> injected", message);
  window.postMessage({ ...message, destination: "injected" }, location.origin);
}

export function postToContent(message: Body<InjectedMessage>) {
  logger.debug("-> content", message);
  window.postMessage({ ...message, destination: "content" }, location.origin);
}

// Suppress "Could not establish connection. Receiving end does not exist." errors
// when the destination (sidepanel/background) is not active.

export function postToBackground(message: Body<PanelMessage>) {
  logger.debug("-> background", message);
  return browser.runtime
    .sendMessage({ ...message, destination: "background" })
    .catch(() => {});
}

export function postToPanel(
  message: Body<ContentMessage> | Body<BackgroundToPanelMessage>,
) {
  logger.debug("-> sidepanel", message);
  return browser.runtime
    .sendMessage({ ...message, destination: "sidepanel" })
    .catch(() => {});
}

export function postToTab(tabId: number, message: BackgroundToTabMessage) {
  logger.debug(`-> tab(${tabId})`, message);
  return browser.tabs.sendMessage(tabId, message).catch(() => {});
}
