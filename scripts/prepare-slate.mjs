import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.join(projectRoot, "out", ".catalyst");
const configPath = path.join(configDir, "slate-config.toml");

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

console.log(`Prepared Slate config: ${path.relative(projectRoot, configPath)}`);
