import logger from "@/logger";
import { browser } from "wxt/browser";

export type Caption = { startMs: number; text: string };

type VideoState = {
  type: "VIDEO_STATE";
  tabId?: number;
  isLoading?: boolean;
  isVideo?: boolean;
  title?: string;
  hasCaptions?: boolean;
  captions?: Caption[];
  timeMs?: number;
};

// Strip destination for sender function parameters
export type Body<T> = T extends { destination: string }
  ? Omit<T, "destination">
  : never;

// window.postMessage: injected -> content
export type InjectedMessage = {
  destination: "content";
  relayToSidePanel?: boolean;
} & VideoState;

// browser.runtime.sendMessage: content -> sidepanel
export type ContentMessage = { destination: "sidepanel" } & (
  | VideoState
  | { type: "YT_NAVIGATE"; isVideo: boolean }
);

// browser.runtime.sendMessage: sidepanel -> background
export type PanelMessage = { destination: "background" } & (
  | { type: "SEEK_VIDEO"; timeMs: number; tabId: number }
  | { type: "TOGGLE_SUBTITLES_ON"; tabId: number }
  | { type: "YOUTUBE_LEAVE"; windowId?: never }
  | { type: "YOUTUBE_RELOAD"; windowId?: never }
);

// browser.runtime.sendMessage: background -> sidepanel
export type BackgroundToPanelMessage = { destination: "sidepanel" } & (
  | { type: "TAB_ACTIVATED"; tabIds: number[] }
  | { type: "TAB_REMOVED"; tabId: number }
);

// browser.tabs.sendMessage: background -> content
export type BackgroundToTabMessage =
  | { type: "RESTORE_STATE" }
  | { type: "SEEK_VIDEO"; timeMs: number }
  | { type: "TOGGLE_SUBTITLES_ON" };

// window.postMessage: content -> injected
export type InjectedCommand = { destination: "injected" } & (
  | {
      type: "RESET_STATE";
    }
  | {
      type: "RESTORE_STATE";
    }
  | {
      type: "TOGGLE_SUBTITLES_ON";
    }
);

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
