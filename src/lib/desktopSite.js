// A phone browser with "Desktop site" ticked lays every page out about 980 px
// wide and shrinks it to fit, so the app shows its computer layout in tiny
// print. The screen size still tells the truth, which is how it is caught.

/** True when a phone (shortest side under 600 px) is laying the page out much wider than its screen. */
export function isDesktopSiteOnPhone({ screenWidth, screenHeight, pageWidth, touch }) {
  if (!touch || !screenWidth || !screenHeight) return false;
  if (Math.min(screenWidth, screenHeight) >= 600) return false;
  return pageWidth > screenWidth * 1.3;
}

function measure() {
  return {
    screenWidth: window.screen?.width,
    screenHeight: window.screen?.height,
    pageWidth: document.documentElement.clientWidth,
    touch: (navigator.maxTouchPoints || 0) > 0,
  };
}

/** Whether the page is still shown in "Desktop site" mode on a phone. */
export const desktopSiteNow = () => (typeof window === 'undefined' ? false : isDesktopSiteOnPhone(measure()));

/**
 * Asks the browser to lay the page out at the phone's real width. Some browsers
 * allow this even in "Desktop site" mode; where they do not, the app shows a
 * note on how to switch it off.
 */
export function fitPhoneScreen() {
  if (!desktopSiteNow()) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute('content', `width=${window.screen.width}, initial-scale=1, viewport-fit=cover`);
}
