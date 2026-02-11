<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { copyToClipboard } from "wxt-module-clipboard/client";
  import { postToBackground as send } from "@/messages";
  import type {
    Caption,
    GetCaptionsResponse,
    ContentMessage,
    BackgroundMessage,
  } from "@/messages";
  import HighlightText from "./HighlightText.svelte";
  import SearchBar from "./SearchBar.svelte";

  type TabData = { captions: Caption[]; title: string };

  let tabDataMap = new SvelteMap<number, TabData>();
  let activeTabId = $state(-1);
  let currentTimeMs = $state(-1);
  let hasCaptions = $state(false); // true: YouTube video with captions, false: YouTube video without captions or non-YouTube page
  let isLoading = $state(false);
  let showSubtitleHint = $state(false);
  let showCaptionHintTimer: ReturnType<typeof setTimeout> | undefined;

  let captions = $derived(tabDataMap.get(activeTabId)?.captions ?? []);
  let videoTitle = $derived(tabDataMap.get(activeTabId)?.title ?? null);

  let activeIndex = $derived.by(() => {
    if (currentTimeMs < 0 || captions.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < captions.length; i++) {
      if (captions[i].startMs <= currentTimeMs) idx = i;
      else break;
    }
    return idx;
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

  function openSearch() {
    showSearch = true;
    currentMatchPos = 0;
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

  function onUserScroll() {
    autoScroll = false;
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
    currentTimeMs = timeMs;
    send({ type: "SEEK_VIDEO", timeMs, tabId: activeTabId });
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
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener("keydown", onKeydown);

    send({ type: "GET_CAPTIONS" }).then((response: GetCaptionsResponse) => {
      if (response?.activeTabId) {
        activeTabId = response.activeTabId;
        if (response.captions.length > 0) {
          tabDataMap.set(response.activeTabId, {
            captions: response.captions,
            title: response.videoTitle,
          });
        }
      }
    });

    browser.runtime.onMessage.addListener(
      (
        message: ContentMessage | BackgroundMessage,
        sender: Browser.runtime.MessageSender,
      ) => {
        if (message.destination !== "sidepanel") return;
        const msg = message;
        const tabId =
          sender.tab?.id ??
          (msg as BackgroundMessage & { tabId: number }).tabId;
        if (!tabId) return;

        switch (msg.type) {
          case "VIDEO_CHANGED":
            tabDataMap.delete(tabId);
            if (tabId === activeTabId) {
              currentTimeMs = -1;
              hasCaptions = msg.isVideo ?? false;
              clearTimeout(showCaptionHintTimer);
              showSubtitleHint = false;
              isLoading = msg.isVideo ?? false;
            }
            break;
          case "VIDEO_DATA": {
            const existing = tabDataMap.get(tabId);
            tabDataMap.set(tabId, {
              captions: msg.captions ?? existing?.captions ?? [],
              title: msg.videoTitle ?? existing?.title ?? "",
            });
            if (tabId === activeTabId) {
              if (msg.captions) {
                isLoading = false;
                clearTimeout(showCaptionHintTimer);
                showSubtitleHint = false;
              } else if (msg.hasCaptions === false) {
                isLoading = false;
              } else if (msg.hasCaptions && isLoading) {
                clearTimeout(showCaptionHintTimer);
                showCaptionHintTimer = setTimeout(() => {
                  if (isLoading && captions.length === 0)
                    showSubtitleHint = true;
                }, 2500);
              }
            }
            break;
          }
          case "VIDEO_TIME_UPDATE":
            if (tabId === activeTabId) {
              currentTimeMs = msg.timeMs;
            }
            break;
          case "TAB_ACTIVATED":
            activeTabId = tabId;
            currentTimeMs = -1;
            hasCaptions = false;
            break;
          case "TAB_REMOVED":
            tabDataMap.delete(tabId);
            break;
        }
      },
    );
  });
</script>

<div
  class="flex h-screen flex-col bg-white pr-1 font-sans text-sm text-gray-900 dark:bg-neutral-900 dark:text-gray-200"
>
  <div class="shrink-0">
    <div
      class="flex items-center justify-between border-b border-gray-200 px-2 py-2 dark:border-neutral-700"
    >
      <div class="group relative min-w-0 overflow-hidden px-0.5">
        <button
          onclick={copyAllCaptions}
          class="block w-full min-w-0 truncate text-sm font-semibold text-left cursor-pointer hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
          disabled={captions.length === 0}
        >
          {videoTitle || ""}
        </button>
        {#if captions.length > 0}
          <div
            class="pointer-events-none absolute left-0 top-full mt-1 z-10 w-[22ch] text-center rounded-lg bg-gray-800 py-1.5 text-xs text-white shadow-lg dark:bg-neutral-700 {copied
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'} transition-opacity"
          >
            {copied ? "Copied to clipboard!" : "Click to copy captions"}
          </div>
        {/if}
      </div>

      <div
        class="flex shrink-0 items-center gap-1 {captions.length > 0
          ? 'visible'
          : 'invisible'}"
      >
        <button
          onclick={() => {
            autoScroll = !autoScroll;
            if (autoScroll && activeIndex >= 0 && captionEls[activeIndex])
              scrollToCaption(captionEls[activeIndex]);
          }}
          class="rounded p-1 text-sm font-semibold {autoScroll
            ? 'text-blue-500 dark:text-blue-400'
            : 'text-gray-400'} hover:bg-gray-200 dark:hover:bg-neutral-700"
          aria-label="Toggle auto-scroll"
          title={autoScroll ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
        >
          Scroll
        </button>
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
    onwheel={onUserScroll}
    ontouchstart={onUserScroll}
    class="flex-1 overflow-y-auto p-2"
  >
    {#if captions.length === 0 && !isLoading}
      <div class="py-8 text-center">
        <p class="text-base font-semibold text-gray-600 dark:text-gray-300">
          {#if hasCaptions}
            No Captions Found
          {:else}
            No Video Detected
          {/if}
        </p>
        <p class="mt-1 text-xs text-gray-400">
          {#if hasCaptions}
            This video doesn't have captions available.
          {:else}
            Navigate to a YouTube video to see captions.
          {/if}
        </p>
      </div>
    {/if}

    {#if captions.length === 0 && isLoading}
      <div class="relative">
        <ul
          class="[&>li]:border-b [&>li]:border-b-gray-100 dark:[&>li]:border-b-neutral-800"
        >
          {#each [15, 25, 40, 18, 32, 22, 35, 20, 28, 24] as chars}
            <li>
              <div class="flex items-baseline gap-2 px-1 py-1.5 text-[13px]">
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
                  send({ type: "TOGGLE_SUBTITLES_ON", tabId: activeTabId })}
                class="mt-2 cursor-pointer text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                Turn on captions
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <ul
      class="[&>li]:border-b [&>li]:border-b-gray-100 dark:[&>li]:border-b-neutral-800"
    >
      {#each captions as caption, i (caption.startMs)}
        {@const isCurrentMatch =
          searchQuery && matchIndices[currentMatchPos] === i}
        <li
          bind:this={captionEls[i]}
          class="{i === activeIndex
            ? 'bg-yellow-50 dark:bg-yellow-900/30'
            : ''} {isCurrentMatch
            ? 'ring-2 ring-inset ring-blue-400'
            : ''}"
        >
          <button
            class="flex w-full cursor-pointer items-baseline gap-2 px-1 py-1.5 text-left text-[13px] {i ===
            activeIndex
              ? 'font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/40'
              : 'hover:bg-gray-100 dark:hover:bg-neutral-800'}"
            onclick={() => seek(caption.startMs)}
          >
            <span
              class="shrink-0 font-mono text-[11px] {i === activeIndex
                ? 'text-gray-900 dark:text-gray-100'
                : 'text-gray-400'}">{formatTime(caption.startMs)}</span
            >
            <HighlightText text={caption.text} query={searchQuery} />
          </button>
        </li>
      {/each}
    </ul>
  </div>
</div>
