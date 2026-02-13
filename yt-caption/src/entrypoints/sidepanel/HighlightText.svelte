<script lang="ts">
  let { text, query }: { text: string; query: string } = $props();

  let parts = $derived.by(() => {
    if (!query) return [{ text, match: false }];
    const lower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const result: { text: string; match: boolean }[] = [];
    let start = 0;
    while (start < text.length) {
      const idx = lower.indexOf(queryLower, start);
      if (idx === -1) {
        result.push({ text: text.slice(start), match: false });
        break;
      }
      if (idx > start)
        result.push({ text: text.slice(start, idx), match: false });
      result.push({ text: text.slice(idx, idx + query.length), match: true });
      start = idx + query.length;
    }
    return result;
  });
</script>

<span class="wrap-break-word">
  {#each parts as part}
    {#if part.match}
      <mark class="rounded-sm bg-yellow-300 dark:bg-yellow-600/60"
        >{part.text}</mark
      >
    {:else}
      {part.text}
    {/if}
  {/each}
</span>
