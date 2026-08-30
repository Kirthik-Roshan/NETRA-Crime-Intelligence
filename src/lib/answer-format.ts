/**
 * answer-format — pure text helpers for the Investigation Assistant.
 *
 * Two jobs, both framework-free (no React) so they stay easy to reason about:
 *   1. Turn a model answer (which may contain light Markdown) into structured
 *      blocks the workspace can render as an investigation dossier, and pull out
 *      the FIR / CrimeNo references so they can be highlighted and inspected.
 *   2. Produce a concise, natural-language version for text-to-speech — never
 *      raw Markdown, and never reading long FIR numbers, audit IDs, confidence
 *      percentages, model/route names or other UI metadata aloud.
 */

// Crime keywords used to name a case naturally in speech ("the cybercrime case")
// and to tag highlighted entities on screen. Order matters: longer, more
// specific phrases first so "vehicle theft" wins over "theft".
export const CRIME_WORDS = [
  "cybercrime", "otp fraud", "online fraud", "credit card fraud", "financial fraud", "fraud",
  "vehicle theft", "bike theft", "car theft", "chain snatching", "snatching", "theft",
  "house break-in", "housebreaking", "burglary", "robbery", "dacoity", "extortion",
  "murder", "homicide", "attempt to murder", "assault", "grievous hurt", "hurt",
  "kidnapping", "kidnap", "abduction", "missing person",
  "cheating", "forgery", "counterfeiting", "counterfeit",
  "narcotics", "narcotic", "ndps", "drug",
  "dowry", "domestic violence", "harassment", "molestation", "rape", "pocso",
  "arson", "rioting", "riot", "trespass",
];

// A CrimeNo is an 18-digit structured number; we accept 15–18 digits so shorter
// legacy references still match, and allow an optional "FIR" prefix. This band
// deliberately excludes IPC sections (3 digits) and phone numbers (10 digits).
const FIR_CAPTURE = /\b(?:FIR[\s.:#-]*(?:no\.?|number)?\s*)?(\d{15,18})\b/gi;

/** Distinct FIR / CrimeNo references in first-appearance order. */
export function extractFirs(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(FIR_CAPTURE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    const n = m[1];
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** First crime keyword mentioned anywhere in the text, or null. */
export function primaryCrime(text: string): string | null {
  const low = (text || "").toLowerCase();
  return CRIME_WORDS.find((w) => low.includes(w)) ?? null;
}

/** Strip Markdown syntax down to plain prose (used before speech). */
export function stripMarkdown(md: string): string {
  return (md || "")
    .replace(/```[\s\S]*?```/g, " ")          // fenced code
    .replace(/`([^`]+)`/g, "$1")               // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")   // links → text
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")         // headings
    .replace(/^\s{0,3}>\s?/gm, "")              // block quotes
    .replace(/^\s*[-*+]\s+/gm, "")              // bullet markers
    .replace(/^\s*\d+\.\s+/gm, "")              // numbered markers
    .replace(/^\s*\|?[\s:|.-]{3,}\|?\s*$/gm, " ") // table rule / hr
    .replace(/\|/g, " ")                         // stray table pipes
    .replace(/\*\*([^*]+)\*\*/g, "$1")          // bold
    .replace(/\*([^*]+)\*/g, "$1")              // italic
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ordinal case phrases for speech, e.g. "the first case". */
const ORDINAL_CASE = [
  "the first case", "the second case", "the third case", "the fourth case", "the fifth case",
  "the sixth case", "the seventh case", "the eighth case", "the ninth case", "the tenth case",
];

/** The sentence surrounding a character index, lower-cased. */
function sentenceAround(text: string, index: number): string {
  const before = text.slice(0, index);
  const start = Math.max(
    before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n"),
  );
  const rest = text.slice(index);
  const rel = rest.search(/[.!?\n]/);
  const end = rel === -1 ? text.length : index + rel;
  return text.slice(start + 1, end).toLowerCase();
}

// Abbreviations whose trailing dot must not be read as a sentence boundary, and
// which read more naturally spelled out in speech.
function expandAbbreviations(text: string): string {
  return text
    .replace(/\bRs\.?\s?/gi, "rupees ")
    .replace(/\bNo\.\s?/g, "number ")
    .replace(/\bapprox\.\s?/gi, "approximately ")
    .replace(/\bvs\.\s?/gi, "versus ");
}

/** Trim to the leading sentences, capped so speech stays short and natural. */
function condense(text: string, hardCap = 380, softCap = 220): string {
  const parts = text.match(/[^.!?।]+[.!?।]+|\S[^.!?।]*$/g) || [text];
  let out = "";
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;
    if (out && out.length + s.length + 1 > hardCap) break;
    out = out ? `${out} ${s}` : s;
    if (out.length >= softCap) break;
  }
  return out.trim() || text.slice(0, hardCap).trim();
}

/**
 * Concise, speakable version of an answer.
 *  - Markdown removed (including structural heading lines).
 *  - Audit IDs, model / route names, latency and confidence percentages removed.
 *  - FIR / CrimeNo references become natural language: dropped where the prose
 *    already says "case", otherwise named ("the cybercrime case") or numbered
 *    ("the first case", "the second case"). No long digit strings are ever read.
 *  - Trimmed to the leading sentences so it is a spoken summary, not the whole
 *    wall of text (which stays visible on screen).
 */
export function naturalizeForSpeech(answer: string, lang: "en" | "kn" = "en"): string {
  const kn = lang === "kn";
  let text = (answer || "")
    .replace(/```[\s\S]*?```/g, " ")               // fenced code
    .replace(/`([^`]+)`/g, "$1")                    // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")          // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")        // links → text
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, " ")           // drop whole heading lines
    .replace(/^\s{0,3}>\s?/gm, "")                   // block quotes
    .replace(/^\s*[-*+]\s+/gm, "")                   // bullet markers
    .replace(/^\s*\d+\.\s+/gm, "")                   // numbered markers
    .replace(/^\s*\|?[\s:|.-]{3,}\|?\s*$/gm, " ")     // table rule / hr
    .replace(/\|/g, " ")                             // stray table pipes
    .replace(/\*\*([^*]+)\*\*/g, "$1")              // bold
    .replace(/\*([^*]+)\*/g, "$1")                  // italic
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1");

  // Drop UI / technical metadata that can leak into prose.
  text = text
    .replace(/\baudit\s*id\b\s*[·:.-]?\s*[A-Z0-9-]+/gi, " ")
    .replace(/\(\s*audit\s*id[^)]*\)/gi, " ")                              // "(audit id A-…)"
    .replace(/\bA-[A-Z0-9]{4,}\b/g, " ")                                  // audit ids
    .replace(/\bVL-[A-Za-z0-9.\-]+\b/g, " ")                              // model ids
    .replace(/\b(?:QuickML|Catalyst|Zia|rule[-\s]?engine|tf[-\s]?idf|embeddings?|RAG|SQL)\b/gi, " ")
    .replace(/\bconfidence\b\s*[:=]?\s*\d{1,3}\s*%/gi, " ")
    .replace(/\b\d{1,3}\s*%/g, " ")                                        // stray percentages
    .replace(/\b\d+\s*ms\b/gi, " ")                                        // latency
    .replace(/\bover\s+\d+\s+records?\b/gi, " ")
    .replace(/\b\d+\s+records?\b/gi, " ")
    .replace(/\b(?:generated|powered)\s+by\b/gi, " ")                      // "generated by …"
    .replace(/\bmodels?\b\s*(?=[.,;:])/gi, " ");                           // dangling "model,"

  // Remove parenthetical case-number references outright — "(FIR 104…)".
  text = text.replace(/[([]\s*(?:FIR[\s.:#-]*(?:no\.?|number)?\s*)?\d{7,}\s*[)\]]/gi, " ");

  // FIR / CrimeNo → natural language, context-aware and per occurrence.
  const order = new Map<string, number>();
  let next = 0;
  const firRe = /((?:case\s+)?(?:FIR[\s.:#-]*(?:no\.?|number)?\s*)?)(\d{15,18})\b/gi;
  text = text.replace(firRe, (_m, pre: string, digits: string, offset: number, full: string) => {
    const prevWord = (full.slice(0, offset).match(/([A-Za-z]+)\s*$/) || [])[1]?.toLowerCase() || "";
    // The prose already names it ("… case", "burglary FIR …") — keep the word
    // that is there and drop the number (and any "FIR" prefix swallowed).
    if (/\bcase\b/i.test(pre) || prevWord === "case" || CRIME_WORDS.includes(prevWord)) return "case ";
    if (kn) return "ಈ ಪ್ರಕರಣ";
    if (!order.has(digits)) order.set(digits, next++);
    const i = order.get(digits)!;
    const crime = primaryCrime(sentenceAround(full, offset));
    return crime ? `the ${crime} case` : ORDINAL_CASE[i] || `case ${i + 1}`;
  });

  // Any remaining long digit run (source ids, phone-like) → neutral phrase.
  text = text.replace(/\b\d{7,}\b/g, kn ? "ಈ ದಾಖಲೆ" : "this record");

  text = expandAbbreviations(text);

  // Collapse newlines and tidy spacing / orphaned punctuation left by removals.
  text = text
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,.;:])\1+/g, "$1")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*\.+/g, ".")
    .replace(/\(\s*\)/g, " ")
    .replace(/\bthe ([a-z ]+? case)\s+the \1\b/gi, "the $1")   // de-dupe repeats
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:.]+/, "")
    .trim();

  text = condense(text);
  if (text) return text;
  return kn ? "ತನಿಖಾ ಫಲಿತಾಂಶ ಸಿದ್ಧವಾಗಿದೆ." : "Here is the investigation result.";
}

/** A structured block parsed from a light-Markdown answer. */
export type AnswerBlock =
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[] };

/** Parse a model answer into headings / paragraphs / lists for the dossier UI. */
export function parseBlocks(md: string): AnswerBlock[] {
  const lines = (md || "").replace(/\r/g, "").split("\n");
  const blocks: AnswerBlock[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) { blocks.push({ kind: "para", text: para.join(" ").trim() }); para = []; }
  };
  const flushList = () => {
    if (list.length) { blocks.push({ kind: "list", items: list.slice() }); list = []; }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
    if (heading) {
      flushPara(); flushList();
      blocks.push({ kind: "heading", text: heading[1].replace(/[*_`]/g, "").trim() });
      continue;
    }
    if (bullet) { flushPara(); list.push(bullet[1].trim()); continue; }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

/** All list items across the answer, flattened — the "Key Findings" source. */
export function keyFindings(blocks: AnswerBlock[]): string[] {
  return blocks.filter((b): b is Extract<AnswerBlock, { kind: "list" }> => b.kind === "list")
    .flatMap((b) => b.items)
    .map((s) => s.trim())
    .filter(Boolean);
}
