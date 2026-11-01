const CACHE_NAME = "mameloshn-web-v6";
const NETWORK_TIMEOUT_MS = 4000;
const APP_SHELL = [
  "./index.html",
  "./styles.css",
  "./course-data.js",
  "./conversation-data.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
];

function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL.map((path) => new Request(path, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("mameloshn-web-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Media elements ask for byte ranges. Answer from the cached full clip, sliced to a 206.
  if (event.request.headers.has("range")) {
    event.respondWith(serveRange(event));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy))
            );
          }
          return response;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit || fetch(event.request)))
    );
    return;
  }

  event.respondWith(
    fetchWithTimeout(event.request)
      .then((response) => {
        if (response.ok && response.status === 200) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          );
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((hit) => hit || fetch(event.request))
      )
  );
});

async function serveRange(event) {
  const key = new URL(event.request.url).href; // full URL, no Range header
  const cache = await caches.open(CACHE_NAME);
  let full = await cache.match(key);
  if (!full) {
    try {
      const fresh = await fetch(key);
      if (fresh.status !== 200) return fetch(event.request);
      await cache.put(key, fresh.clone());
      full = fresh;
    } catch (_error) {
      return Response.error();
    }
  }
  const buffer = await full.arrayBuffer();
  const total = buffer.byteLength;
  const match = /bytes=(\d*)-(\d*)/.exec(event.request.headers.get("range")) || [];
  let start;
  let end;
  if (match[1] === "" && match[2]) {
    // Suffix range: the last N bytes.
    start = Math.max(0, total - Number(match[2]));
    end = total - 1;
  } else {
    start = match[1] ? Number(match[1]) : 0;
    end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  }
  if (start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }
  const slice = buffer.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": full.headers.get("Content-Type") || "audio/mp4",
      "Content-Length": String(slice.byteLength),
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
    },
  });
}
