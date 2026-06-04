const CACHE_NAME = "gorky-shell-v1"
const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/favicon.svg", "/og.svg"]
const API_PATH_PREFIXES = ["/api/", "/v1/", "/__qa/"]
const API_PATHS = ["/health"]

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
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin || isApiRequest(url)) {
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

function isApiRequest(url) {
  return (
    API_PATHS.includes(url.pathname) ||
    API_PATH_PREFIXES.some((pathPrefix) => url.pathname.startsWith(pathPrefix))
  )
}
