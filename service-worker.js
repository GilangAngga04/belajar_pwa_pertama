const CACHE_NAME = "rentrack-v7";
const BASE_URL = self.registration.scope;

const STATIC_ASSETS = [
  `${BASE_URL}offline.html`,
  `${BASE_URL}manifest.json`,
  `${BASE_URL}icons/app-icon-192.png`,
  `${BASE_URL}icons/app-icon-512.png`,
];

// Install — hanya cache aset statis, BUKAN index.html
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn("Cache sebagian gagal:", err))
  );
});

// Activate — hapus semua cache versi lama
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log("Hapus cache lama:", key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// Fetch — NETWORK-FIRST untuk HTML, CACHE-FIRST untuk aset statis
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Abaikan chrome-extension dan non-GET
  if (url.protocol.startsWith("chrome-extension")) return;
  if (request.method !== "GET") return;

  if (url.origin === self.location.origin) {

    // ── Network-first untuk navigasi / HTML ──────────────────
    if (request.mode === "navigate" || request.destination === "document") {
      event.respondWith(
        fetch(request)
          .then(networkRes => {
            // Jangan cache HTML agar selalu fresh
            return networkRes;
          })
          .catch(() =>
            caches.match(request)
              .then(cached => cached || caches.match(`${BASE_URL}offline.html`))
          )
      );
      return;
    }

    // ── Cache-first untuk aset statis lainnya ────────────────
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request)
          .then(networkRes => {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then(c => c.put(request, clone));
            }
            return networkRes;
          })
          .catch(() =>
            new Response("Offline", { status: 503, statusText: "Service Unavailable" })
          );
      })
    );

  } else {
    // ── External CDN — network dulu, fallback cache ───────────
    event.respondWith(
      fetch(request)
        .then(networkRes => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(request))
    );
  }
});
