const CACHE_NAME = "netra-static-chunks-v1";
const MAX_ACTIVE_FETCHES = 4;
let activeFetches = 0;
const waitingFetches = [];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function acquireSlot() {
  if (activeFetches < MAX_ACTIVE_FETCHES) {
    activeFetches += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitingFetches.push(resolve));
}

function releaseSlot() {
  const next = waitingFetches.shift();
  if (next) next();
  else activeFetches -= 1;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadChunk(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  await acquireSlot();
  try {
    let lastResponse;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(request);
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && /javascript|ecmascript/i.test(contentType)) {
          await cache.put(request, response.clone()).catch(() => undefined);
          return response;
        }
        lastResponse = response;
        if (response.status !== 429 && response.status !== 503) return response;
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2) await delay(700 * (attempt + 1));
    }
    if (lastResponse) return lastResponse;
    throw lastError || new Error("Static chunk could not be loaded");
  } finally {
    releaseSlot();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      !/^\/app\/_next\/static\/chunks\/.*\.js$/.test(url.pathname)) return;
  event.respondWith(loadChunk(request));
});
