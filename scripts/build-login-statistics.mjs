import Database from "better-sqlite3";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  KSP_ER_TABLES,
  buildKspReadModel,
} = require("../functions/ai_quickml/ksp-read-model.js");
const db = new Database("data/netra.db", { readonly: true });
try {
  const model = buildKspReadModel(
    Object.fromEntries(
      KSP_ER_TABLES.map((table) => [
        table,
        db.prepare(`SELECT * FROM "${table}"`).all(),
      ]),
    ),
  );
  const snapshot = {
    firs: model.Firs.length,
    accused: model.Criminals.length,
    districts: new Set(model.Firs.map((row) => row.district).filter(Boolean))
      .size,
    stations: model.PoliceStations.length,
    source: "Imported KSP-schema synthetic dataset",
  };
  writeFileSync(
    "src/data/login-statistics.json",
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  console.log(
    "Login statistics generated from official-schema database rows:",
    snapshot,
  );
} finally {
  db.close();
}
