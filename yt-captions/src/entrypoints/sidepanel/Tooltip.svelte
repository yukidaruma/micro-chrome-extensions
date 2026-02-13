<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    text: string;
    visible?: boolean;
    enabled?: boolean;
    align?: "left" | "right";
    children: Snippet;
  };

  let { text, visible = false, enabled = true, align = "left", children }: Props = $props();
</script>

<div class="group relative min-w-0">
  <div class="overflow-clip">
    {@render children()}
  </div>
  {#if enabled}
    <div
      class={[
        "pointer-events-none absolute top-full mt-1 z-10 w-[22ch] text-center rounded-lg bg-gray-800 py-1.5 text-xs text-white shadow-lg dark:bg-neutral-700 transition-opacity",
        align === "left" ? "left-0" : "right-0",
        {
          "opacity-100": visible,
          "opacity-0 group-hover:opacity-100": !visible,
        },
      ]}
    >
      {text}
    </div>
  {/if}
</div>
