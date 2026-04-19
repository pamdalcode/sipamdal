// ─── SIPAMDAL Service Worker v3 ───────────────────────────────────────────────
const CACHE_NAME   = 'sipamdal-v3';
const CACHE_STATIC = 'sipamdal-static-v3';

// Asset statis yang di-cache saat install
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './logo-bbpka.jpg',
  './icon-192.png',
  './icon-512.png'
];

// ── Install: cache semua asset statis ─────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: hapus cache lama ────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network first untuk Firebase, Cache first untuk asset lokal ─────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase & CDN: selalu network, jangan cache
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('cdnjs.cloudflare') ||
    e.request.method !== 'GET'
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', {status: 503})));
    return;
  }

  // Asset lokal: Cache first, fallback ke network, fallback ke index.html
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

// ── Background Sync: flush audit log offline ──────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'sync-audit-log') {
    e.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'FLUSH_AUDIT' }))
      )
    );
  }
});

// ── Push Notification (siap dipakai) ─────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title   = data.title   || 'SIPAMDAL';
  const options = {
    body:    data.body    || 'Ada notifikasi baru',
    icon:    './icon-192.png',
    badge:   './icon-96.png',
    tag:     data.tag     || 'sipamdal-notif',
    data:    data.url     || './',
    actions: data.actions || [],
    vibrate: [200, 100, 200],
    requireInteraction: data.important || false
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow(e.notification.data || './');
    })
  );
});

// ── Periodic Background Sync (jika browser support) ──────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'sipamdal-check') {
    e.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'PERIODIC_SYNC' }))
      )
    );
  }
});
