<script lang="ts">
  import { tick } from "svelte";

  let {
    matchCount,
    currentMatch,
    onquery,
    onnavigate,
    onclose,
  }: {
    matchCount: number;
    currentMatch: number;
    onquery: (query: string) => void;
    onnavigate: (delta: number) => void;
    onclose: () => void;
  } = $props();

  let inputEl = $state<HTMLInputElement | null>(null);
  let query = $state("");

  export function focus() {
    tick().then(() => inputEl?.focus());
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onclose();
    } else if (e.key === "Enter") {
      onnavigate(e.shiftKey ? -1 : 1);
    }
  }
</script>

<div
  class="flex items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
>
  <input
    bind:this={inputEl}
    bind:value={query}
    oninput={() => onquery(query)}
    {onkeydown}
    placeholder="Search captions…"
    class="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs outline-none focus:border-blue-400 dark:border-neutral-600 dark:bg-neutral-900 dark:focus:border-blue-500"
  />

  {#if query}
    <span class="shrink-0 text-[11px] text-gray-400">
      {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : "0/0"}
    </span>

    <button
      onclick={() => onnavigate(-1)}
      class="rounded p-0.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-700"
      aria-label="Previous match">▲</button
    >
    <button
      onclick={() => onnavigate(1)}
      class="rounded p-0.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-700"
      aria-label="Next match">▼</button
    >
  {/if}

  <button
    onclick={onclose}
    class="rounded p-0.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-neutral-700"
    aria-label="Close search">✕</button
  >
</div>
