export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    // Monkey-patch document.startViewTransition to do nothing
    document.startViewTransition = (fn) => typeof fn === "function" && fn();
  },
});
