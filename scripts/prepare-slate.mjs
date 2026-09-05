import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "out");
const sitesDir = path.join(projectRoot, "dist");
const sitesClientDir = path.join(sitesDir, "client");
const sitesServerDir = path.join(sitesDir, "server");
const sitesHostingDir = path.join(sitesDir, ".openai");
const configDir = path.join(projectRoot, "out", ".catalyst");
const configPath = path.join(configDir, "slate-config.toml");
const hostingDir = path.join(outputDir, ".openai");
const hostingSourcePath = path.join(projectRoot, ".openai", "hosting.json");
const hostingOutputPath = path.join(hostingDir, "hosting.json");
const clientPackagePath = path.join(outputDir, "client-package.json");
const clientVersion = process.env.CATALYST_CLIENT_VERSION || `1.0.${Math.floor(Date.now() / 1000)}`;
const notFoundHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Opening NETRA</title>
</head>
<body>
  <p>Opening NETRA...</p>
  <script>
    (function () {
      var pathname = window.location.pathname;
      var lastSegment = pathname.split("/").pop() || "";
      if (lastSegment === "index.html" || /\\.[a-z0-9]+$/i.test(lastSegment)) return;
      var route = pathname.endsWith("/") ? pathname : pathname + "/";
      window.location.replace(route + "index.html" + window.location.search + window.location.hash);
    }());
  </script>
</body>
</html>
`;

await mkdir(configDir, { recursive: true });
await mkdir(hostingDir, { recursive: true });
await writeFile(
  configPath,
  [
    "# Generated after every static export for Catalyst Slate deployment.",
    'framework = "static"',
    'deployment_name = "default"',
    "",
  ].join("\n"),
  "utf8",
);

await writeFile(hostingOutputPath, await readFile(hostingSourcePath, "utf8"), "utf8");
await writeFile(path.join(outputDir, "404.html"), notFoundHtml, "utf8");
await mkdir(path.join(outputDir, "404"), { recursive: true });
await writeFile(path.join(outputDir, "404", "index.html"), notFoundHtml, "utf8");

await writeFile(
  clientPackagePath,
  `${JSON.stringify({
    name: "netra-crime-intelligence",
    version: clientVersion,
    description: "NETRA authenticated crime intelligence workspace",
    // Always enter through NETRA so Catalyst's embedded provider can render in
    // the animated officer gateway instead of replacing it with hosted login.
    homepage: "index.html",
    login_redirect: "index.html",
    404: "404.html",
  }, null, 2)}\n`,
  "utf8",
);

await rm(sitesDir, { recursive: true, force: true });
await mkdir(sitesServerDir, { recursive: true });
await mkdir(sitesHostingDir, { recursive: true });
await cp(outputDir, sitesClientDir, { recursive: true });
await writeFile(
  path.join(sitesServerDir, "index.js"),
  [
    "export default {",
    "  async fetch(request, env) {",
    "    const response = await env.ASSETS.fetch(request);",
    '    const acceptsHtml = request.headers.get("accept")?.includes("text/html");',
    "",
    '    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {',
    "      return response;",
    "    }",
    "",
    "    const routeUrl = new URL(request.url);",
    '    const pathname = routeUrl.pathname.replace(/\\/+$/, "");',
    '    const lastSegment = pathname.split("/").pop() || "";',
    '    if (!lastSegment.includes(".")) {',
    '      routeUrl.pathname = `${pathname || ""}/index.html`;',
    '      routeUrl.search = "";',
    "      const routeResponse = await env.ASSETS.fetch(new Request(routeUrl, request));",
    "      if (routeResponse.status !== 404) return routeResponse;",
    "    }",
    "",
    "    const indexUrl = new URL(request.url);",
    '    indexUrl.pathname = "/index.html";',
    '    indexUrl.search = "";',
    "    return env.ASSETS.fetch(new Request(indexUrl, request));",
    "  },",
    "};",
    "",
  ].join("\n"),
  "utf8",
);
await writeFile(path.join(sitesHostingDir, "hosting.json"), await readFile(hostingSourcePath, "utf8"), "utf8");

console.log(
  `Prepared Catalyst hosting metadata (${clientVersion}) in ${path.relative(projectRoot, outputDir)} and Sites artifact in ${path.relative(projectRoot, sitesDir)}`,
);
