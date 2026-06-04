const CACHE_NAME = "gorky-shell-v1"
const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/favicon.svg", "/og.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => cachedResponse("/")))
    return
  }

  event.respondWith(fetch(request).catch(() => cachedResponse(request)))
})

function cachedResponse(request) {
  return caches.match(request).then((response) => response || Response.error())
}
