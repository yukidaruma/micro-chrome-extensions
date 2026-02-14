<script lang="ts">
  import { onMount, tick } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { copyToClipboard } from "wxt-module-clipboard/client";
  import * as messages from "@/messages";
  import HighlightText from "./HighlightText.svelte";
  import SearchBar from "./SearchBar.svelte";
  import Tooltip from "./Tooltip.svelte";
  import logger from "@/logger";

  type TabData = {
    captions: messages.Caption[];
    title: string | null;
    timeMs: number;
    isVideo: boolean;
    hasCaptions: boolean;
    isLoading: boolean;
    showSubtitleHint: boolean;
  };

  let isReady = $state(false);
  let tabDataMap = new SvelteMap<number, TabData>();
  let activeYtTabId = $state(-1);
  let showCaptionHintTimer: ReturnType<typeof setTimeout> | undefined;

  const defaultTabData: TabData = {
    captions: [],
    title: null,
    timeMs: -1,
    isVideo: false,
    hasCaptions: false,
    isLoading: true,
    showSubtitleHint: false,
  } as const;

  function updateTabData(tabId: number, patch: Partial<TabData> | null) {
    logger.log(`updateTabData(${tabId})`, patch);

    if (!patch) {
      tabDataMap.delete(tabId);
      return;
    }

    const existing = tabDataMap.get(tabId) ?? defaultTabData;
    tabDataMap.set(tabId, { ...existing, ...patch });
  }

  let activeTabData = $derived(tabDataMap.get(activeYtTabId));
  let captions = $derived(activeTabData?.captions ?? []);
  let videoTitle = $derived(activeTabData?.title ?? null);
  let currentTimeMs = $derived(activeTabData?.timeMs ?? -1);
  let isVideo = $derived(activeTabData?.isVideo ?? false);
  let isLoading = $derived(activeTabData?.isLoading ?? true);
  let showSubtitleHint = $derived(activeTabData?.showSubtitleHint ?? false);

  let activeIndex = $derived.by(() => {
    if (currentTimeMs < 0 || captions.length === 0) return -1;
    return captions.findLastIndex((c) => c.startMs <= currentTimeMs);
  });

  let captionEls: HTMLLIElement[] = [];
  let scrollContainer: HTMLDivElement;
  let autoScroll = $state(true);

  let showSearch = $state(false);
  let searchQuery = $state("");
  let searchBar = $state<ReturnType<typeof SearchBar> | null>(null);

  let matchIndices = $derived(
    searchQuery
      ? captions.reduce<number[]>((acc, c, i) => {
          if (c.text.toLowerCase().includes(searchQuery.toLowerCase()))
            acc.push(i);
          return acc;
        }, [])
      : [],
  );
  let currentMatchPos = $state(0);

  async function openSearch() {
    showSearch = true;
    currentMatchPos = 0;
    await tick();
    searchBar?.focus();
  }

  function closeSearch() {
    showSearch = false;
    searchQuery = "";
    currentMatchPos = 0;
  }

  function onSearchQuery(query: string) {
    searchQuery = query;
    currentMatchPos = 0;
    if (matchIndices.length > 0) {
      const idx = matchIndices[0];
      captionEls[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function navigateMatch(delta: number) {
    if (matchIndices.length === 0) return;
    currentMatchPos =
      (currentMatchPos + delta + matchIndices.length) % matchIndices.length;
    const idx = matchIndices[currentMatchPos];
    captionEls[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function scrollToCaption(el: HTMLElement) {
    if (!scrollContainer) return;
    const offsetTop = el.offsetTop - scrollContainer.offsetTop;
    const target = offsetTop - 40;
    scrollContainer.scrollTo({ top: target, behavior: "smooth" });
  }

  function passiveScrollHandler(node: HTMLElement) {
    function onUserScroll() {
      autoScroll = false;
    }

    node.addEventListener("wheel", onUserScroll, { passive: true });
    node.addEventListener("touchstart", onUserScroll, { passive: true });
    return {
      destroy() {
        node.removeEventListener("wheel", onUserScroll);
        node.removeEventListener("touchstart", onUserScroll);
      },
    };
  }

  $effect(() => {
    if (
      autoScroll &&
      !showSearch &&
      activeIndex >= 0 &&
      captionEls[activeIndex]
    ) {
      scrollToCaption(captionEls[activeIndex]);
    }
  });

  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function seek(timeMs: number) {
    updateTabData(activeYtTabId, { timeMs }); // Update local state immediately without waiting for the seek
    messages.postToBackground({
      type: "SEEK_VIDEO",
      timeMs,
      tabId: activeYtTabId,
    });
  }

  let copied = $state(false);

  async function copyAllCaptions() {
    const text = captions.map((c) => c.text).join("\n");
    const res = await copyToClipboard(text);
    if (res.success) {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  }

  onMount(() => {
    messages
      .postToBackground({ type: "SIDE_PANEL_OPEN" })
      .then(() => (isReady = true));

    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        openSearch();
      }
    };

    const onMessage = (
      message: messages.ContentMessage | messages.BackgroundToPanelMessage,
      sender: Browser.runtime.MessageSender,
    ) => {
      if (message.destination !== "sidepanel") return;

      if (message.type === "TAB_ACTIVATED") {
        const { tabIds, restoring } = message;
        if (tabIds.length === 0) {
          activeYtTabId = -1;
          return;
        }

        // tabIds are scored by background.ts (active > /watch).
        // On ties (i.e. switching to a non-YT tab with multiple inactive /watch tabs),
        // prioritize a tab that already has captions loaded.
        let best = tabIds[0] ?? -1;
        for (const id of tabIds) {
          if (tabDataMap.has(id)) {
            best = id;
            if (tabDataMap.get(id)!.captions.length) break;
          }
        }
        activeYtTabId = best;

        // When restoring, VIDEO_STATE from RESTORE_STATE may not have arrived yet.
        // Initialize with loading state to avoid flashing "No Video Detected".
        if (restoring && !tabDataMap.has(best)) {
          updateTabData(best, { ...defaultTabData, isVideo: true });
        }
        return;
      }

      const tabId = sender.tab?.id;
      if (!tabId) return;
      if (activeYtTabId < 0) activeYtTabId = tabId;

      switch (message.type) {
        case "YT_NAVIGATE":
          clearTimeout(showCaptionHintTimer);
          if (message.isVideo) {
            updateTabData(tabId, {
              ...defaultTabData,
              isVideo: true,
              isLoading: true,
            });
          } else {
            updateTabData(tabId, {
              ...defaultTabData,
              isLoading: false,
            });
          }
          break;
        case "VIDEO_STATE": {
          const patch: Partial<TabData> = {};
          if (message.isVideo != null) patch.isVideo = message.isVideo;
          if (message.timeMs != null) patch.timeMs = message.timeMs;
          if (message.isLoading != null) patch.isLoading = message.isLoading;
          if (message.title != null) patch.title = message.title;
          if (message.captions) {
            patch.captions = message.captions;

            patch.showSubtitleHint = false;
            clearTimeout(showCaptionHintTimer);
          }

          if (message.hasCaptions) {
            const existing = tabDataMap.get(tabId);
            if (existing?.isLoading) {
              clearTimeout(showCaptionHintTimer);
              showCaptionHintTimer = setTimeout(() => {
                const current = tabDataMap.get(tabId);
                if (current?.isLoading && current.captions.length === 0) {
                  updateTabData(tabId, { showSubtitleHint: true });
                }
              }, 3000);
            }
          }

          updateTabData(tabId, patch);
          break;
        }
        case "TAB_REMOVED":
          tabDataMap.delete(tabId);
          break;
      }
    };

    document.addEventListener("keydown", onKeydown);
    browser.runtime.onMessage.addListener(onMessage);

    return () => {
      document.removeEventListener("keydown", onKeydown);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  });
</script>

<div
  class={[
    "flex h-screen flex-col pr-1 font-sans text-sm",
    { hidden: !isReady },
  ]}
>
  <div class="shrink-0">
    <div
      class="flex items-center justify-between border-b border-gray-200 px-2 py-2 dark:border-neutral-700"
    >
      <Tooltip
        text={copied ? "Copied to clipboard!" : "Click to copy captions"}
        visible={copied}
        enabled={captions.length > 0}
      >
        <button
          onclick={copyAllCaptions}
          class="block w-full min-w-0 truncate text-sm font-semibold text-left cursor-pointer hover:text-blue-500 dark:hover:text-blue-400 transition-colors px-0.5"
          disabled={captions.length === 0}
        >
          {videoTitle}
        </button>
      </Tooltip>

      <div
        class={[
          "flex shrink-0 items-center gap-1",
          { visible: captions.length > 0, invisible: captions.length === 0 },
        ]}
      >
        <Tooltip
          text={autoScroll ? "Turn off auto-scroll" : "Turn on auto-scroll"}
          align="right"
        >
          <button
            onclick={() => {
              autoScroll = !autoScroll;
              if (autoScroll && activeIndex >= 0 && captionEls[activeIndex])
                scrollToCaption(captionEls[activeIndex]);
            }}
            class={[
              "rounded p-1 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-neutral-700",
              {
                "text-blue-500 dark:text-blue-400": autoScroll,
                "text-gray-400": !autoScroll,
              },
            ]}
            aria-label="Toggle auto-scroll"
          >
            Scroll
          </button>
        </Tooltip>
      </div>
    </div>

    {#if showSearch}
      <SearchBar
        bind:this={searchBar}
        matchCount={matchIndices.length}
        currentMatch={currentMatchPos}
        onquery={onSearchQuery}
        onnavigate={navigateMatch}
        onclose={closeSearch}
      />
    {/if}
  </div>

  <div
    bind:this={scrollContainer}
    use:passiveScrollHandler
    class="flex-1 overflow-y-auto p-2"
  >
    {#if !isVideo}
      <div class="py-8 text-center">
        <p class="text-base font-semibold text-gray-600 dark:text-gray-300">
          No Video Detected
        </p>
        <p class="mt-1 text-xs text-gray-400">
          Navigate to a YouTube video to see captions.
        </p>
      </div>
    {:else if isLoading}
      <div class="relative">
        <ul
          class="[&>li]:border-b [&>li]:border-b-gray-100 dark:[&>li]:border-b-neutral-800"
        >
          {#each [15, 25, 40, 18, 32, 22, 35, 20, 28, 24] as chars}
            <li>
              <div
                class="flex min-h-8 items-baseline gap-2 px-1 py-1.5 text-[13px]"
              >
                <div
                  class="h-5 w-8 shrink-0 animate-pulse rounded bg-gray-200 dark:bg-neutral-700"
                ></div>
                <div
                  class="h-5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700"
                  style="width: max(4rem, calc({chars}ch))"
                ></div>
              </div>
            </li>
          {/each}
        </ul>
        {#if showSubtitleHint}
          <div
            class="absolute inset-0 flex items-start justify-center bg-white/80 pt-8 dark:bg-neutral-900/80"
          >
            <div class="text-center">
              <p
                class="text-base font-semibold text-gray-600 dark:text-gray-300"
              >
                Captions not showing up?
              </p>
              <p class="mt-1 text-xs text-gray-400">
                Try turning on captions on the video.
              </p>
              <button
                onclick={() =>
                  messages.postToBackground({
                    type: "TOGGLE_SUBTITLES_ON",
                    tabId: activeYtTabId,
                  })}
                class="mt-2 cursor-pointer text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                Turn on captions
              </button>
            </div>
          </div>
        {/if}
      </div>
    {:else if captions.length === 0}
      <div class="py-8 text-center">
        <p class="text-base font-semibold text-gray-600 dark:text-gray-300">
          No Captions Available
        </p>
        <p class="mt-1 text-xs text-gray-400">
          This video doesn't have captions.
        </p>
      </div>
    {:else}
      <ul
        class="[&>li]:border-b [&>li]:border-b-gray-100 dark:[&>li]:border-b-neutral-800"
      >
        {#each captions as caption, i (caption.startMs)}
          {@const isCurrentMatch =
            searchQuery && matchIndices[currentMatchPos] === i}
          <li
            bind:this={captionEls[i]}
            class={{
              "ring-2 ring-inset ring-blue-400": isCurrentMatch,
            }}
          >
            <button
              class={[
                "flex min-h-8 w-full cursor-pointer items-baseline gap-2 px-1 py-1.5 text-left text-[13px]",
                i === activeIndex
                  ? "text-black dark:text-gray-100 bg-yellow-100 dark:bg-yellow-900/40"
                  : "text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-neutral-800",
              ]}
              onclick={() => seek(caption.startMs)}
            >
              <span
                class="shrink-0 font-mono text-[11px] text-gray-500 dark:text-gray-400"
              >
                {formatTime(caption.startMs)}
              </span>
              <HighlightText text={caption.text} query={searchQuery} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
