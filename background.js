const KEY = 'duosyncPair';
const pending = new Map();

async function getPair() {
  const data = await chrome.storage.local.get(KEY);
  return data[KEY] || null;
}
async function setPair(pair) { await chrome.storage.local.set({ [KEY]: pair }); }
function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch(() => null);
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    const senderTabId = sender.tab?.id;
    if (msg?.type === 'GET_PAIR') { respond({ ok: true, pair: await getPair() }); return; }
    if (msg?.type === 'AUTHORIZE_CURRENT_TAB' && Number.isInteger(msg.tabId)) {
      // This message originates from the extension popup opened by a user on the current tab.
      // activeTab is a temporary grant; this registry only helps the Studio guide the user.
      const tab = await chrome.tabs.get(msg.tabId);
      const data = await chrome.storage.local.get('duosyncAuthorizedTabs');
      const ids = new Set(data.duosyncAuthorizedTabs || []);
      ids.add(msg.tabId);
      await chrome.storage.local.set({ duosyncAuthorizedTabs: [...ids] });
      respond({ ok: true, tabId: msg.tabId, title: tab.title || msg.title || tab.url }); return;
    }
    if (msg?.type === 'GET_AUTHORIZED_TABS') {
      const data = await chrome.storage.local.get('duosyncAuthorizedTabs');
      respond({ ok: true, tabIds: data.duosyncAuthorizedTabs || [] }); return;
    }
    if (msg?.type === 'SET_PAIR') {
      const { tabA, tabB, startA, startB } = msg;
      if (!Number.isInteger(tabA) || !Number.isInteger(tabB) || tabA === tabB) {
        respond({ ok: false, error: 'Choose two different tabs.' }); return;
      }
      const pair = { tabA, tabB, startA: Number(startA) || 0, startB: Number(startB) || 0, linked: true, updatedAt: Date.now() };
      await setPair(pair);
      const results = await Promise.all([
        sendToTab(tabA, { type: 'DUOSYNC_CONFIG', side: 'A', pair }),
        sendToTab(tabB, { type: 'DUOSYNC_CONFIG', side: 'B', pair })
      ]);
      respond({ ok: true, pair, results }); return;
    }
    if (msg?.type === 'UNLINK') {
      const pair = await getPair();
      if (pair) {
        await Promise.all([sendToTab(pair.tabA, { type: 'DUOSYNC_UNLINK' }), sendToTab(pair.tabB, { type: 'DUOSYNC_UNLINK' })]);
      }
      await chrome.storage.local.remove(KEY);
      respond({ ok: true }); return;
    }
    if (msg?.type === 'VIDEO_INFO') {
      respond({ ok: true, tabId: senderTabId, frameUrl: sender.url, videoCount: msg.videoCount, videos: msg.videos }); return;
    }
    if (msg?.type === 'VIDEO_EVENT' && senderTabId != null) {
      const pair = await getPair();
      if (!pair?.linked || ![pair.tabA, pair.tabB].includes(senderTabId)) return;
      const sourceSide = senderTabId === pair.tabA ? 'A' : 'B';
      const targetTabId = sourceSide === 'A' ? pair.tabB : pair.tabA;
      const delta = sourceSide === 'A' ? pair.startB - pair.startA : pair.startA - pair.startB;
      await sendToTab(targetTabId, { type: 'DUOSYNC_APPLY', action: msg.action, time: Number.isFinite(msg.time) ? msg.time + delta : undefined, rate: msg.rate, sourceSide });
      return;
    }
    if (msg?.type === 'MASTER_TICK' && senderTabId != null) {
      const pair = await getPair();
      if (!pair?.linked || senderTabId !== pair.tabA || !Number.isFinite(msg.time)) return;
      const expectedB = msg.time + pair.startB - pair.startA;
      await sendToTab(pair.tabB, { type: 'DUOSYNC_DRIFT', expectedTime: expectedB, playing: msg.playing });
      return;
    }
    if (msg?.type === 'GET_CAPTURE_ID' && Number.isInteger(msg.targetTabId)) {
      try {
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: msg.targetTabId });
        respond({ ok: true, streamId });
      } catch (err) {
        respond({ ok: false, error: err?.message || 'Could not capture this tab.' });
      }
      return;
    }
    if (msg?.type === 'FOCUS_TAB' && Number.isInteger(msg.tabId)) {
      await chrome.tabs.update(msg.tabId, { active: true });
      const tab = await chrome.tabs.get(msg.tabId);
      if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
      respond({ ok: true }); return;
    }
  })().catch(err => { try { respond({ ok: false, error: err.message }); } catch {} });
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const auth = await chrome.storage.local.get('duosyncAuthorizedTabs');
  await chrome.storage.local.set({ duosyncAuthorizedTabs: (auth.duosyncAuthorizedTabs || []).filter(id => id !== tabId) });
  const pair = await getPair();
  if (pair && (pair.tabA === tabId || pair.tabB === tabId)) await chrome.storage.local.remove(KEY);
});
