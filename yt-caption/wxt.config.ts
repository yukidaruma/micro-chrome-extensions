import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  srcDir: "src",
  modules: ["@wxt-dev/module-svelte", "wxt-module-clipboard"],
  manifest: {
    permissions: ["sidePanel"],
    web_accessible_resources: [
      {
        resources: ["injected.js"],
        matches: ["*://www.youtube.com/*"],
      },
    ],
  },
  webExt: {
    disabled: true,
  },
});
