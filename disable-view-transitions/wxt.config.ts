import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/auto-icons"],
  manifest: {
    name: "Disable View Transitions",
  },
  autoIcons: {
    baseIconPath: "assets/icon.svg",
  },
});
