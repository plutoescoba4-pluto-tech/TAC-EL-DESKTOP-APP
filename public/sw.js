/* TAC-EL service worker.
 *  - Lets the app install on a phone or computer.
 *  - Keeps a copy of the app itself, so it OPENS with no internet (like WhatsApp). Church data still needs a connection.
 *  - Always asks the network first for the page, so people get the newest version whenever they are online.
 *  - Receives push notifications and opens the right screen when one is tapped.
 * It never stores church data (Supabase calls are not touched), so news, chats and accounts are never out of date.
 */
const VERSION = 'tac-el-v2';
const ASSETS = 'tac-el-assets';
const OFFLINE_URL = '/offline.html';
const STATIC = [OFFLINE_URL, '/icons/icon-192.png'];
const MAX_ASSETS = 160;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== ASSETS).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_ASSETS) await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map((k) => cache.delete(k)));
}

// Opening the app: network first (newest version). On a slow or missing connection, fall back to the saved copy.
async function openApp(req) {
  const cache = await caches.open(VERSION);
  const network = fetch(req).then((r) => { if (r && r.ok) cache.put('/', r.clone()); return r; });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
  try {
    const fast = await Promise.race([network, timeout]);
    if (fast) return fast;
    const saved = await cache.match('/');
    return saved || (await network);
  } catch (e) {
    return (await cache.match('/')) || (await cache.match(OFFLINE_URL));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // Supabase and other sites: never touched
  if (url.pathname.startsWith('/apps/')) return;        // the embedded register / attendance / assets pages need the internet anyway

  if (req.mode === 'navigate') { event.respondWith(openApp(req)); return; }

  // Built app files have a new name every release, so a saved copy is always correct.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r && r.ok) { cache.put(req, r.clone()); trim(cache); }
      return r;
    }));
    return;
  }

  // Icons, fonts, images: show the saved copy straight away and refresh it quietly.
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(req);
      const refresh = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || refresh;
    }));
  }
});

// ---- Push -------------------------------------------------------------------------------
// The server sends JSON: { title, body, url, tag, icon }
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'TAC-EL', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'TAC-EL';
  const isIOS = /iphone|ipad|ipod/i.test(self.navigator.userAgent);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // The app is open and visible: it already shows the message itself (sound and badge).
      if (!isIOS && wins.some((w) => w.visibilityState === 'visible')) return;
      return self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || undefined,          // same tag = the newer message replaces the older one
      renotify: !!data.tag,
      data: { url: data.url || '/' },
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          if ('navigate' in w) w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// If the browser replaces the push address, tell the app so it can save the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => wins.forEach((w) => w.postMessage({ type: 'push-subscription-changed' })))
  );
});
