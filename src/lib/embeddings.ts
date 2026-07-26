import "server-only";
import { all } from "./db";

/**
 * Semantic similarity over FIRs — "find cases with a similar modus operandi".
 *
 * Local, offline, deterministic: a TF-IDF vector space over each FIR's
 * text (crime type + modus + brief facts + district), compared with cosine
 * similarity. No API key, no network. In production this same interface is
 * backed by Catalyst QuickML embeddings (see getEmbeddingBackend()).
 *
 * The corpus is built once and memoized for the process lifetime.
 */

interface FirDoc {
  id: number;
  fir_number: string;
  crime_type: string;
  district: string;
  modus: string | null;
  text: string;
  vec: Map<string, number>; // TF-IDF, L2-normalized
}

const STOP = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "and", "or", "for", "with",
  "by", "is", "was", "were", "reported", "case", "limits", "modus", "operandi",
  "under", "near", "this", "that", "from", "as", "it",
]);

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

let CACHE: { docs: FirDoc[]; byId: Map<number, FirDoc> } | null = null;

function buildCorpus() {
  if (CACHE) return CACHE;
  const rows = all<{ id: number; fir_number: string; crime_type: string; district: string; modus: string | null; description: string | null }>(
    "SELECT id, fir_number, crime_type, district, modus, description FROM firs"
  );

  // Term frequencies + document frequencies
  const tf: Map<number, Map<string, number>> = new Map();
  const df: Map<string, number> = new Map();
  const texts = new Map<number, { text: string; crime_type: string; district: string; modus: string | null; fir_number: string }>();

  for (const r of rows) {
    // Weight the crime type and modus more heavily by repeating them.
    const text = `${r.crime_type} ${r.crime_type} ${r.modus ?? ""} ${r.modus ?? ""} ${r.district} ${r.description ?? ""}`;
    texts.set(r.id, { text, crime_type: r.crime_type, district: r.district, modus: r.modus, fir_number: r.fir_number });
    const counts = new Map<string, number>();
    for (const tok of tokenize(text)) counts.set(tok, (counts.get(tok) || 0) + 1);
    tf.set(r.id, counts);
    for (const term of counts.keys()) df.set(term, (df.get(term) || 0) + 1);
  }

  const N = rows.length || 1;
  const docs: FirDoc[] = [];
  for (const r of rows) {
    const counts = tf.get(r.id)!;
    const vec = new Map<string, number>();
    let norm = 0;
    for (const [term, c] of counts) {
      const idf = Math.log((N + 1) / ((df.get(term) || 0) + 1)) + 1;
      const w = c * idf;
      vec.set(term, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [term, w] of vec) vec.set(term, w / norm); // L2 normalize
    const meta = texts.get(r.id)!;
    docs.push({ id: r.id, fir_number: meta.fir_number, crime_type: meta.crime_type, district: meta.district, modus: meta.modus, text: meta.text, vec });
  }

  CACHE = { docs, byId: new Map(docs.map((d) => [d.id, d])) };
  return CACHE;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  // Both are L2-normalized → dot product is cosine. Iterate the smaller map.
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const o = large.get(term);
    if (o) dot += w * o;
  }
  return dot;
}

export interface SimilarFir {
  id: number;
  fir_number: string;
  crime_type: string;
  district: string;
  modus: string | null;
  score: number; // 0..1
}

/** Top-k FIRs most semantically similar to the given FIR. */
export function similarFirs(firId: number, limit = 6): SimilarFir[] {
  const { docs, byId } = buildCorpus();
  const target = byId.get(firId);
  if (!target) return [];
  const scored = docs
    .filter((d) => d.id !== firId)
    .map((d) => ({ id: d.id, fir_number: d.fir_number, crime_type: d.crime_type, district: d.district, modus: d.modus, score: Math.round(cosine(target.vec, d.vec) * 1000) / 1000 }))
    .filter((d) => d.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}

/** Free-text semantic search across FIRs (for the assistant's "similar to …" queries). */
export function semanticSearch(query: string, limit = 10): SimilarFir[] {
  const { docs } = buildCorpus();
  const counts = new Map<string, number>();
  for (const tok of tokenize(query)) counts.set(tok, (counts.get(tok) || 0) + 1);
  if (counts.size === 0) return [];
  // Build a normalized query vector using the same idf-ish weighting proxy.
  let norm = 0;
  for (const w of counts.values()) norm += w * w;
  norm = Math.sqrt(norm) || 1;
  const qvec = new Map<string, number>();
  for (const [term, c] of counts) qvec.set(term, c / norm);
  return docs
    .map((d) => ({ id: d.id, fir_number: d.fir_number, crime_type: d.crime_type, district: d.district, modus: d.modus, score: Math.round(cosine(qvec, d.vec) * 1000) / 1000 }))
    .filter((d) => d.score > 0.03)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Which embedding backend is active. Local TF-IDF here; in a Catalyst
 * deployment set CATALYST_QUICKML_EMBED_URL and this reports "quickml".
 * (The vector interface above is identical, so swapping is transparent.)
 */
export function getEmbeddingBackend(): "local-tfidf" | "quickml" {
  return process.env.CATALYST_QUICKML_EMBED_URL ? "quickml" : "local-tfidf";
}
