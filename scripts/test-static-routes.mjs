#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const routes = [
  "", "login", "dashboard", "assistant", "cases", "cases/record", "evidence",
  "criminals", "criminals/record", "analytics", "maps", "network",
  "predictions", "database", "reports", "admin", "settings", "investigations",
];

for (const route of routes) {
  const relative = route ? `${route}/index.html` : "index.html";
  const file = path.join(root, "out", relative);
  const metadata = await stat(file);
  assert(metadata.size > 500, `${relative} must contain a rendered static page`);
  const html = await readFile(file, "utf8");
  assert.match(html, /\/app\/_next\//, `${relative} must use the Catalyst /app asset base path`);
}

const notFound = await readFile(path.join(root, "out", "404.html"), "utf8");
assert.match(notFound, /route \+ "index\.html"/, "404 fallback must retry clean URLs as route/index.html");

const clientPackage = JSON.parse(await readFile(path.join(root, "out", "client-package.json"), "utf8"));
assert.equal(clientPackage.homepage, "index.html");
assert.equal(clientPackage.login_redirect, "index.html");
assert.equal(clientPackage["404"], "404.html");

const sitesWorker = await readFile(path.join(root, "dist", "server", "index.js"), "utf8");
assert.match(sitesWorker, /\/index\.html/, "Sites fallback worker must resolve static index files");
await stat(path.join(root, "dist", "client", "dashboard", "index.html"));

const appLink = await readFile(path.join(root, "src", "components", "AppLink.tsx"), "utf8");
assert.match(appLink, /router\.push\(href\)/, "Catalyst links must navigate without reloading the authenticated shell");
assert.match(appLink, /history\.replaceState/, "Catalyst links must retain reload-safe index.html URLs");

const authClient = await readFile(path.join(root, "src", "lib", "auth-client.ts"), "utf8");
assert.doesNotMatch(authClient, /window\.location\.assign\(appDocumentPath\(route\)\)/, "Programmatic app navigation must not reload Catalyst auth");

console.log(`Static refresh routes verified: ${routes.length} pages plus Catalyst 404 fallback`);
