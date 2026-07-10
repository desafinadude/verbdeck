import ikuCsv from "@/data/questions/iku.csv";
import ikuMeta from "@/data/verbs/iku.json";
import miruCsv from "@/data/questions/miru.csv";
import miruMeta from "@/data/verbs/miru.json";

/* ------------------------------------------------------------------ *
 * Data types
 * ------------------------------------------------------------------ */

export interface Conjugation {
  ja: string;
  romaji: string;
  en: string;
}

/** Lightweight metadata per verb — shown on the intro card / hero. */
export interface VerbMeta {
  verb: string;
  verbRomaji: string;
  verbEnglish: string;
  particle: string;
  particleEnglish: string;
  conjugations: Record<string, Conjugation>;
}

/* ------------------------------------------------------------------ *
 * Generated question type (what the UI consumes)
 * ------------------------------------------------------------------ */

export interface Question {
  /** conversational state label, e.g. "Polite Present (+)" */
  state: string;
  /** question spoken + shown to the user */
  question: string;
  /** romaji of the question (shown only if Romaji toggle is on) */
  questionRomaji: string;
  /** English translation of the question (always shown) */
  questionEnglish: string;
  /** keyword hint shown to the user */
  hintKeyword: string;
  /** romaji of the hint keyword (shown if Romaji toggle is on) */
  hintKeywordRomaji: string;
  /** English translation of the hint (always shown) */
  hintEnglish: string;
  /** the full expected spoken answer */
  answer: string;
  /** romaji of the answer */
  answerRomaji: string;
  /** English translation of the answer */
  answerEnglish: string;
  /** strict verb-ending fragment that must appear (absolute string match) */
  strictVerb: string;
}

/* ------------------------------------------------------------------ *
 * Verb registry — add more verbs here as more CSV files are created
 * ------------------------------------------------------------------ */

export const VERBS: Record<string, VerbMeta> = {
  iku: ikuMeta as VerbMeta,
  miru: miruMeta as VerbMeta,
};

/* ------------------------------------------------------------------ *
 * CSV bank
 *
 * The question content is hand-authored in data/questions/<verb>.csv and
 * loaded at build time as a raw string (see next.config.js → asset/source).
 * Each row is a complete, grammatically-correct Q&A pair. A round picks
 * one random row per grammatical form, so every variation (subject, time,
 * place, long vs short answer) gets exercised across sessions while every
 * round still drills all 10 forms.
 * ------------------------------------------------------------------ */

/** One parsed row of the CSV question bank. */
interface CsvRow {
  form: string;
  question: string;
  questionRomaji: string;
  questionEnglish: string;
  hintKeyword: string;
  hintKeywordRomaji: string;
  hintEnglish: string;
  answer: string;
  answerRomaji: string;
  answerEnglish: string;
  strictVerb: string;
}

/**
 * RFC-4180 CSV parser — handles quoted fields, escaped double-quotes (""),
 * embedded commas and newlines. Cells may be CRLF or LF terminated.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // swallow; handled by \n
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // Flush the final field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Parse a raw CSV string into typed rows, skipping the header line. */
function loadBank(csv: string): CsvRow[] {
  const table = parseCsv(csv);
  if (table.length < 2) return [];

  const header = table[0];
  const idx = (name: string) => header.indexOf(name);
  const columns = {
    form: idx("form"),
    question: idx("question_ja"),
    questionRomaji: idx("question_romaji"),
    questionEnglish: idx("question_en"),
    hintKeyword: idx("hint_ja"),
    hintKeywordRomaji: idx("hint_romaji"),
    hintEnglish: idx("hint_en"),
    answer: idx("answer_ja"),
    answerRomaji: idx("answer_romaji"),
    answerEnglish: idx("answer_en"),
    strictVerb: idx("strict_verb"),
  };

  const rows: CsvRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.length < header.length) continue; // skip malformed / blank lines
    const get = (col: number) => (cells[col] ?? "").trim();
    rows.push({
      form: get(columns.form),
      question: get(columns.question),
      questionRomaji: get(columns.questionRomaji),
      questionEnglish: get(columns.questionEnglish),
      hintKeyword: get(columns.hintKeyword),
      hintKeywordRomaji: get(columns.hintKeywordRomaji),
      hintEnglish: get(columns.hintEnglish),
      answer: get(columns.answer),
      answerRomaji: get(columns.answerRomaji),
      answerEnglish: get(columns.answerEnglish),
      strictVerb: get(columns.strictVerb),
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * The 10 grammatical forms — order defines the dot-matrix order.
 * Each form has a human label and the CSV `form` key it draws from.
 * ------------------------------------------------------------------ */

interface FormDef {
  key: string;
  label: string;
}

const FORMS: FormDef[] = [
  { key: "polite_present_pos", label: "Polite Present (+)" },
  { key: "polite_present_neg", label: "Polite Present (-)" },
  { key: "polite_past_pos", label: "Polite Past (+)" },
  { key: "polite_past_neg", label: "Polite Past (-)" },
  { key: "casual_present_pos", label: "Casual Present (+)" },
  { key: "casual_present_neg", label: "Casual Present (-)" },
  { key: "casual_past_pos", label: "Casual Past (+)" },
  { key: "casual_past_neg", label: "Casual Past (-)" },
  { key: "te_request", label: "Te-Form (Request)" },
  { key: "te_continuous", label: "Te-Form (Continuous)" },
];

/* ------------------------------------------------------------------ *
 * Seeded RNG so a given session is deterministic (reproducible picks).
 * ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/* ------------------------------------------------------------------ *
 * Load the CSV banks once per verb (module load). The bank is a flat
 * array grouped by form for quick per-form random selection.
 * ------------------------------------------------------------------ */

const BANKS: Record<string, Record<string, CsvRow[]>> = {
  iku: groupByForm(loadBank(ikuCsv)),
  miru: groupByForm(loadBank(miruCsv)),
};

function groupByForm(rows: CsvRow[]): Record<string, CsvRow[]> {
  const map: Record<string, CsvRow[]> = {};
  for (const row of rows) {
    if (!row.form) continue;
    (map[row.form] ??= []).push(row);
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * Generate the 10-question set for a verb.
 *
 * @param verbKey   key into VERBS (e.g. "iku")
 * @param seed      numeric seed for reproducible picks (default: Date.now)
 * ------------------------------------------------------------------ */

export function generateQuestions(verbKey: string, seed?: number): Question[] {
  const v = VERBS[verbKey];
  if (!v) throw new Error(`Unknown verb: ${verbKey}`);

  const bank = BANKS[verbKey];
  if (!bank) throw new Error(`No question bank for verb: ${verbKey}`);

  const rng = mulberry32(seed ?? Date.now());

  return FORMS.map((form) => {
    const pool = bank[form.key];
    if (!pool || pool.length === 0) {
      throw new Error(`No rows for form "${form.key}" in ${verbKey} bank`);
    }
    const row = pick(pool, rng);

    return {
      state: form.label,
      question: row.question,
      questionRomaji: row.questionRomaji,
      questionEnglish: row.questionEnglish,
      hintKeyword: row.hintKeyword,
      hintKeywordRomaji: row.hintKeywordRomaji,
      hintEnglish: row.hintEnglish,
      answer: row.answer,
      answerRomaji: row.answerRomaji,
      answerEnglish: row.answerEnglish,
      strictVerb: row.strictVerb,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Evaluation logic — strict verb-ending + noun presence.
 *
 * The CSV already encodes the exact verb-ending fragment per row
 * (e.g. にいきませんでした), so the check is an absolute substring
 * match on the normalized transcript plus the hint keyword.
 * ------------------------------------------------------------------ */

export function normalize(s: string): string {
  return s
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, "")
    .replace(/[。、,!！?？]/g, "")
    .trim();
}

export function evaluateAnswer(
  transcript: string,
  q: Question
): { passed: boolean; reason: string } {
  const t = normalize(transcript);
  if (!t) return { passed: false, reason: "何も聞こえませんでした" };
  const verb = normalize(q.strictVerb);
  const noun = normalize(q.hintKeyword);

  if (!t.includes(verb)) {
    return { passed: false, reason: `動詞: ${q.strictVerb} が見つかりません` };
  }
  if (noun && !t.includes(noun)) {
    return { passed: false, reason: `名詞: ${q.hintKeyword} が見つかりません` };
  }
  return { passed: true, reason: "正解" };
}
