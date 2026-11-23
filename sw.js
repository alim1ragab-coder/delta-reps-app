/* TAGADDOD Delta Reps - Service Worker */
const VERSION = "v20261123-2";
const SHELL_CACHE = `delta-shell-${VERSION}`;
const RUNTIME_CACHE = `delta-runtime-${VERSION}`;

const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20261123-v2",
  "./analysis.js",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // لا تكاش طلبات Google Apps Script أو أي API
  if (url.hostname.includes("script.google.com") || url.hostname.includes("googleusercontent.com")) return;

  // app.js دائمًا من الشبكة (عشان التحديثات توصلك فورًا)
  if (url.pathname.endsWith("/app.js")) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // shell: cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html")))
    );
    return;
  }

  // خارجي (CDN): network-first مع fallback
  event.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});
