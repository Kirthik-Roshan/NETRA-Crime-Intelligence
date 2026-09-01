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

await writeFile(
  clientPackagePath,
  `${JSON.stringify({
    name: "netra-crime-intelligence",
    version: clientVersion,
    description: "NETRA authenticated crime intelligence workspace",
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
