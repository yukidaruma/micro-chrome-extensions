# <img src="./assets/icon.svg" width="28" height="28"> Disable View Transitions

<center><img width="400" src="./promo-1280x800.svg"></center>

<a href="https://chromewebstore.google.com/detail/igommcnaiomapjgfbmhaapnfgffagpak"><img src="https://img.shields.io/chrome-web-store/v/igommcnaiomapjgfbmhaapnfgffagpak?style=flat-square&color=%234285f4&label=Version&logo=google-chrome&logoColor=white" alt="Version"></a>
<a href="https://chromewebstore.google.com/detail/igommcnaiomapjgfbmhaapnfgffagpak"><img src="https://img.shields.io/chrome-web-store/users/igommcnaiomapjgfbmhaapnfgffagpak?style=flat-square&color=%234285f4&label=Users&logo=googlechrome&logoColor=white" alt="Users"></a>

Turns off animations that use the [View Transition API](https://developer.mozilla.org/docs/Web/API/View_Transition_API).

Monkey-patches [`document.startViewTransition`](https://developer.mozilla.org/docs/Web/API/Document/startViewTransition) to skip the animation completely.

## Note for Advanced Users

If you're familiar with UserScript, you can achieve the same effect by writing the following code:

```js
document.startViewTransition = (fn) => typeof fn === "function" && fn();
```
