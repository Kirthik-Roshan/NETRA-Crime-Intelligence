import "server-only";
import { all, get } from "./db";

/**
 * Whole-database entity lookup for the AI assistant.
 *
 * Detects an identifier in the query — CrimeNo, phone number, vehicle plate,
 * or a person's name — searches across the database, and assembles a FULL
 * LINKED DOSSIER (the record + everything connected to it: owner, FIRs,
 * co-accused, vehicles, phones, arrests). Entirely local; no external AI.
 */

export interface Dossier {
  matched: boolean;
  kind: "fir" | "phone" | "vehicle" | "person" | "none";
  answer: string;
  rows: Record<string, unknown>[]; // tabular detail for the assistant
  evidence: string[];
}

function criminalDossier(id: number): { summary: string; rows: Record<string, unknown>[]; evidence: string[] } | null {
  const c = get<{ id: number; name: string; aliases: string; risk_score: number; status: string; home_district: string; crime_category: string; age: number; gender: string }>(
    "SELECT * FROM criminals WHERE id=?",
    [id]
  );
  if (!c) return null;
  const firs = all<{ fir_number: string; crime_type: string; district: string; status: string; occurred_at: string }>(
    `SELECT f.fir_number, f.crime_type, f.district, f.status, f.occurred_at
     FROM firs f JOIN fir_criminals fc ON fc.fir_id=f.id WHERE fc.criminal_id=? ORDER BY f.occurred_at DESC`,
    [id]
  );
  const phones = all<{ number: string; carrier: string }>("SELECT number, carrier FROM phones WHERE owner_criminal_id=?", [id]);
  const vehicles = all<{ plate: string; make: string; model: string }>("SELECT plate, make, model FROM vehicles WHERE owner_criminal_id=?", [id]);
  const arrests = all<{ arrested_at: string; district: string; arrest_type: string }>("SELECT arrested_at, district, arrest_type FROM arrests WHERE criminal_id=? ORDER BY arrested_at DESC", [id]);
  const associates = all<{ name: string; risk_score: number }>(
    `SELECT c2.name, c2.risk_score FROM relationships r JOIN criminals c2 ON c2.id = (CASE WHEN r.source_id=? THEN r.target_id ELSE r.source_id END)
     WHERE r.source_type='criminal' AND r.target_type='criminal' AND (r.source_id=? OR r.target_id=?) LIMIT 8`,
    [id, id, id]
  );
  const aliases = (() => { try { return (JSON.parse(c.aliases || "[]") as string[]).join(", "); } catch { return ""; } })();

  const summary =
    `📇 ${c.name}${aliases ? ` (aka ${aliases})` : ""} — risk ${c.risk_score}/100, status ${c.status.replace(/_/g, " ")}, based in ${c.home_district}. ` +
    `Linked to ${firs.length} FIR${firs.length === 1 ? "" : "s"}, ${arrests.length} arrest/surrender event${arrests.length === 1 ? "" : "s"}, ` +
    `${phones.length} phone${phones.length === 1 ? "" : "s"}, ${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}, ${associates.length} known associate${associates.length === 1 ? "" : "s"}` +
    `${phones.length ? `. Phones: ${phones.map((p) => p.number).join(", ")}` : ""}` +
    `${vehicles.length ? `. Vehicles: ${vehicles.map((v) => `${v.plate} (${v.make} ${v.model})`).join(", ")}` : ""}` +
    `${associates.length ? `. Associates: ${associates.map((a) => a.name).join(", ")}` : ""}.`;

  return { summary, rows: firs as unknown as Record<string, unknown>[], evidence: firs.slice(0, 5).map((f) => f.fir_number) };
}

export function entityLookup(query: string): Dossier | null {
  const q = query.trim();

  // Vehicle plate (KA-01-AB-1234)
  const plate = q.match(/KA[\s-]?\d{1,2}[\s-]?[A-Za-z]{1,2}[\s-]?\d{1,4}/i);
  // CrimeNo — a long digit run (real CrimeNo is 18 digits). 12+ avoids phones.
  const crimeNo = q.match(/\d{12,}/);
  // Phone — an Indian mobile: exactly 10 digits (6-9 lead), optional +91 prefix,
  // NOT part of a longer run (so an 18-digit CrimeNo won't be read as a phone).
  const phone = q.match(/(?<!\d)(?:\+?91[\s-]?)?([6-9]\d{9})(?!\d)/);

  // 1) FIR / CrimeNo → full case dossier
  if (crimeNo) {
    const num = crimeNo[0];
    const fir = get<{ id: number; fir_number: string; crime_type: string; district: string; status: string; ipc_sections: string; modus: string; description: string }>(
      "SELECT * FROM firs WHERE fir_number LIKE ? OR id=? LIMIT 1",
      [`%${num}%`, Number(num)]
    );
    if (fir) {
      const accused = all<{ name: string; risk_score: number; id: number }>(
        "SELECT cr.id, cr.name, cr.risk_score FROM criminals cr JOIN fir_criminals fc ON fc.criminal_id=cr.id WHERE fc.fir_id=?",
        [fir.id]
      );
      const victims = all<{ name: string }>("SELECT name FROM victims WHERE fir_id=?", [fir.id]);
      const rows = all<Record<string, unknown>>(
        "SELECT fir_number, crime_type, district, ipc_sections, status, modus, occurred_at FROM firs WHERE id=?",
        [fir.id]
      );
      const answer =
        `📁 FIR ${fir.fir_number} — ${fir.crime_type} in ${fir.district} (${fir.ipc_sections}), status ${String(fir.status).replace(/_/g, " ")}. ` +
        `Modus: ${String(fir.modus || "").replace(/_/g, " ")}. Accused: ${accused.map((a) => a.name).join(", ") || "none recorded"}. ` +
        `Victims: ${victims.map((v) => v.name).join(", ") || "none recorded"}.`;
      return { matched: true, kind: "fir", answer, rows, evidence: [fir.fir_number] };
    }
  }

  // 2) Phone → owner + their dossier
  if (phone) {
    const digits = phone[1]; // the 10 mobile digits
    const ph = get<{ number: string; owner_criminal_id: number }>(
      "SELECT number, owner_criminal_id FROM phones WHERE replace(replace(replace(number,' ',''),'-',''),'+','') LIKE ?",
      [`%${digits}%`]
    );
    if (ph?.owner_criminal_id) {
      const d = criminalDossier(ph.owner_criminal_id);
      if (d) return { matched: true, kind: "phone", answer: `📞 ${ph.number} belongs to this profile. ${d.summary}`, rows: d.rows, evidence: d.evidence };
    }
  }

  // 3) Plate → owner + dossier
  if (plate) {
    const p = plate[0].replace(/\s/g, "").toUpperCase();
    const v = get<{ plate: string; owner_criminal_id: number; make: string; model: string }>(
      "SELECT plate, owner_criminal_id, make, model FROM vehicles WHERE replace(plate,' ','') LIKE ?",
      [`%${p.replace(/-/g, "%")}%`]
    );
    if (v?.owner_criminal_id) {
      const d = criminalDossier(v.owner_criminal_id);
      if (d) return { matched: true, kind: "vehicle", answer: `🚗 ${v.plate} (${v.make} ${v.model}) is linked to this profile. ${d.summary}`, rows: d.rows, evidence: d.evidence };
    }
  }

  // 4) Name → person dossier (strip command words)
  const nameGuess = q
    .replace(/\b(search|find|show|lookup|look up|details?|detail|of|for|the|profile|criminal|person|suspect|phone|number|vehicle|plate|fir|case|dossier|about|give|me|intelligence|record|records)\b/gi, "")
    .replace(/[^\p{L}\s]/gu, "")
    .trim();
  if (nameGuess.length >= 3) {
    const c = get<{ id: number; name: string }>("SELECT id, name FROM criminals WHERE name LIKE ? ORDER BY risk_score DESC LIMIT 1", [`%${nameGuess}%`]);
    if (c) {
      const d = criminalDossier(c.id);
      if (d) return { matched: true, kind: "person", answer: d.summary, rows: d.rows, evidence: d.evidence };
    }
  }

  return null;
}

/** True when the query reads like an explicit record lookup. */
export function looksLikeLookup(query: string): boolean {
  return /\b(search|find|lookup|look up|details?|dossier|who (is|owns)|phone|plate|vehicle|profile of|record|fir\s*\d|crime\s*no)\b/i.test(query)
    || /\b\d{9,}\b/.test(query)
    || /KA[\s-]?\d{1,2}[\s-]?[A-Za-z]{1,2}/i.test(query);
}
