import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "out");
const configDir = path.join(projectRoot, "out", ".catalyst");
const configPath = path.join(configDir, "slate-config.toml");
const clientPackagePath = path.join(outputDir, "client-package.json");
const clientVersion = process.env.CATALYST_CLIENT_VERSION || `1.0.${Math.floor(Date.now() / 1000)}`;

await mkdir(configDir, { recursive: true });
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

console.log(`Prepared Catalyst hosting metadata (${clientVersion}) in ${path.relative(projectRoot, outputDir)}`);
