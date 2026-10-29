import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const listeners = new Map();
const stored = new Map();
let requests = 0;
const origin = "https://netra.example";

runInNewContext(readFileSync("public/netra-static-sw.js", "utf8"), {
  self: {
    location: { origin },
    addEventListener: (name, callback) => listeners.set(name, callback),
  },
  caches: {
    open: async () => ({
      match: async (request) => stored.get(request.url)?.clone(),
      put: async (request, response) => { stored.set(request.url, response.clone()); },
    }),
  },
  fetch: async () => {
    requests += 1;
    return requests === 1
      ? new Response('{"error":"throttled"}', { status: 429, headers: { "content-type": "application/json" } })
      : new Response("self.webpackChunk_NETRA=[];", { status: 200, headers: { "content-type": "application/javascript" } });
  },
  URL,
  setTimeout,
});

async function intercepted(path) {
  let result;
  listeners.get("fetch")({
    request: { method: "GET", url: `${origin}${path}` },
    respondWith: (promise) => { result = promise; },
  });
  return result;
}

const chunk = "/app/_next/static/chunks/117-test.js";
const first = await intercepted(chunk);
assert.equal((await first).status, 200);
assert.equal(requests, 2, "a 429 must be retried");
assert.equal(stored.size, 1, "only valid JavaScript is cached");
assert.equal((await intercepted(chunk)).status, 200);
assert.equal(requests, 2, "a cached chunk must avoid another network request");
assert.equal(await intercepted("/app/dashboard/index.html"), undefined);
assert.equal(await intercepted("/server/ai_quickml/"), undefined);

console.log("Static worker verified: throttled JS retries, caches valid chunks, and ignores app data");
