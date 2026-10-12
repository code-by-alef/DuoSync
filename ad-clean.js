(() => {
  // Best-effort cleanup for common ad markup. Site-specific and injected ads may remain.
  const selectors = [
    '[id*="google_ads"]','[id*="googleads"]','[id*="ad-container"]','[id*="ad_container"]',
    '[id^="ad_"]','[id^="ads_"]','[class*="ad-container"]','[class*="ad-wrapper"]',
    '[class*="advertisement"]','[class*="advert-banner"]','[class*="adsbygoogle"]','ins.adsbygoogle',
    'iframe[src*="doubleclick.net"]','iframe[src*="googlesyndication.com"]','iframe[src*="adservice.google"]',
    '[data-ad]','[data-ad-slot]','[aria-label="Advertisement"]','[aria-label="advertisement"]',
    '.advertisement','.advertising','.ad-banner','.ad-wrapper','.ad-container','.ads-container'
  ];
  const clean = () => {
    for (const selector of selectors) {
      let nodes = [];
      try { nodes = document.querySelectorAll(selector); } catch {}
      for (const node of nodes) {
        // Never remove a video/player or an ancestor containing a video.
        if (node.matches('video') || node.querySelector?.('video')) continue;
        node.style.setProperty('display', 'none', 'important');
        node.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  };
  clean();
  const observer = new MutationObserver(() => clean());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 120000);
})();
