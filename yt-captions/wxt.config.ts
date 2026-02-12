import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  srcDir: "src",
  modules: [
    "@wxt-dev/auto-icons",
    "@wxt-dev/module-svelte",
    "wxt-module-clipboard",
  ],
  manifest: {
    name: "YT Caption Panel",
    permissions: ["sidePanel"],
    web_accessible_resources: [
      {
        resources: ["injected.js"],
        matches: ["*://www.youtube.com/*"],
      },
    ],
  },
  autoIcons: {
    baseIconPath: "assets/icon.svg",
    developmentIndicator: "overlay",
  },
  webExt: {
    disabled: true,
  },
  dev: {
    server: {
      host: "0.0.0.0",
      port: 3332,
    },
  },
});
