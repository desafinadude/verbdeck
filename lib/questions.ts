import ikuCsv from "@/data/questions/iku.csv";
import ikuMeta from "@/data/verbs/iku.json";
import miruCsv from "@/data/questions/miru.csv";
import miruMeta from "@/data/verbs/miru.json";
import taberuCsv from "@/data/questions/taberu.csv";
import taberuMeta from "@/data/verbs/taberu.json";

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
  /* ---- combine-form fields (present only on the combine_te form) ---- */
  /** the second verb joined via te-form, e.g. "見る" (null on single-verb forms) */
  secondVerb?: string;
  /** romaji of the second verb */
  secondVerbRomaji?: string;
  /** english gloss of the second verb */
  secondVerbEnglish?: string;
  /** strict ending fragment for the second verb (combine forms only) */
  strictVerb2?: string;
}

/* ------------------------------------------------------------------ *
 * Verb registry — add more verbs here as more CSV files are created
 * ------------------------------------------------------------------ */

export const VERBS: Record<string, VerbMeta> = {
  iku: ikuMeta as VerbMeta,
  miru: miruMeta as VerbMeta,
  taberu: taberuMeta as VerbMeta,
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
  // Bonus combine form — chains this verb's te-form into a second verb.
  // Drawn from a separate *_combine.csv bank; unlocked only after the
  // first 10 forms are mastered (handled in the UI).
  { key: "combine_te", label: "Combine (Te-link)" },
];

/** Number of single-verb forms (the classic 10-dot loop). */
export const CORE_FORMS = 10;
/** Total forms including the bonus combine dot. */
export const TOTAL_FORMS = FORMS.length;

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
  taberu: groupByForm(loadBank(taberuCsv)),
};

function groupByForm(rows: CsvRow[]): Record<string, CsvRow[]> {
  const map: Record<string, CsvRow[]> = {};
  for (const row of rows) {
    if (!row.form) continue;
    (map[row.form] ??= []).push(row);
  }
  return map;
}

/**
 * Generate the combine (te-link) question programmatically.
 *
 * The te-form is Japanese's conjunctive form — it links two actions in
 * sequence. Crucially, **the te-form itself has no tense or register**;
 * the tense (present/past) and register (polite/casual) of the entire
 * sentence come from the final verb. So we drill four variations:
 *
 *   1. Polite present:  京都に行って、お寺を見ます。
 *   2. Polite past:     京都に行って、お寺を見ました。
 *   3. Casual present:  京都に行って、お寺を見る。
 *   4. Casual past:     京都に行って、お寺を見た。
 *
 * The time word must match the tense, so we pull both verbs' noun+time
 * from the matching tense+register CSV pool (e.g. `polite_past_pos`
 * uses 昨日/先週, `polite_present_pos` uses 明日/来週). This also gives
 * us the correct hiragana `strict_verb` for the second verb's ending —
 * no manual kana conversion needed.
 *
 * The second verb is picked randomly from the registry. Adding verb #50
 * instantly enables combines with all 49 existing verbs — zero extra
 * CSV authoring required.
 */
function generateCombineQuestion(
  verbKey: string,
  rng: () => number
): Question {
  const v = VERBS[verbKey];
  const otherKeys = Object.keys(VERBS).filter((k) => k !== verbKey);
  if (otherKeys.length === 0) {
    throw new Error(`No other verbs to combine with for "${verbKey}"`);
  }
  const secondKey = pick(otherKeys, rng);
  const v2 = VERBS[secondKey];

  // --- Pick the final verb's tense × register ---
  const FINAL_FORMS = [
    "polite_present_pos",
    "polite_past_pos",
    "casual_present_pos",
    "casual_past_pos",
  ] as const;
  const finalFormKey = pick([...FINAL_FORMS], rng);
  const isPast = finalFormKey.includes("past");
  const isPolite = finalFormKey.includes("polite");

  // --- First verb: te-form (register-independent, tense-independent) ---
  const v1TePool = BANKS[verbKey]?.["te_request"] ?? [];
  if (v1TePool.length === 0) {
    throw new Error(`No te_request rows for "${verbKey}" to source combine te-form`);
  }
  const v1TeRow = pick(v1TePool, rng);
  const strictVerb1 = v1TeRow.strictVerb.replace(/ください$/, "");
  const teFormKanji = (v.conjugations["te_connective"]?.ja
    ?? v.conjugations["te_request"]?.ja.replace(/ください$/, ""))!;
  const teFormRomaji = (v.conjugations["te_connective"]?.romaji
    ?? v.conjugations["te_request"]?.romaji.replace(/ kudasai$/, ""))!;

  // --- Pull nouns + time from the matching tense+register pool ---
  // This ensures time words match the tense (昨日 for past, 明日 for present)
  // and gives us the correct hiragana strict_verb for the second verb.
  // Filter out third-person rows (彼は…, 彼女は…, 彼らは…) since combines
  // are first-person by design.
  const firstPersonPool = (pool: CsvRow[]) =>
    pool.filter((r) => !/^彼[は女ら]/.test(r.question));

  const v1Pool = firstPersonPool(BANKS[verbKey]?.[finalFormKey] ?? []);
  if (v1Pool.length === 0) {
    throw new Error(`No first-person ${finalFormKey} rows for "${verbKey}" to source combine noun/time`);
  }
  const v1Row = pick(v1Pool, rng);
  const timeMatch = v1Row.question.match(/^([^、]+)、/);
  const timeWord = timeMatch?.[1] ?? (isPast ? "昨日" : "明日");

  const v2Pool = firstPersonPool(BANKS[secondKey]?.[finalFormKey] ?? []);
  if (v2Pool.length === 0) {
    throw new Error(`No first-person ${finalFormKey} rows for "${secondKey}" to source combine noun`);
  }
  const v2Row = pick(v2Pool, rng);
  const strictVerb2 = v2Row.strictVerb; // already correct hiragana for this form

  // --- Final verb conjugation (from JSON, for display) ---
  const finalConj = v2.conjugations[finalFormKey];
  if (!finalConj) {
    throw new Error(`No ${finalFormKey} conjugation for verb "${secondKey}"`);
  }
  const finalVerbKanji = finalConj.ja;
  const finalVerbRomaji = finalConj.romaji;

  // --- Construct the combined answer ---
  const noun1 = v1Row.hintKeyword;
  const noun2 = v2Row.hintKeyword;

  const answer = `${timeWord}、${noun1}${v.particle}${teFormKanji}、${noun2}${v2.particle}${finalVerbKanji}。`;

  const p1Romaji = v.particle === "に" ? "ni" : "o";
  const p2Romaji = v2.particle === "に" ? "ni" : "o";
  const answerRomaji = `${timeWord}, ${v1Row.hintKeywordRomaji} ${p1Romaji} ${teFormRomaji}, ${v2Row.hintKeywordRomaji} ${p2Romaji} ${finalVerbRomaji}.`;

  // --- English construction ---
  // Translate the Japanese time word to English.
  const TIME_WORDS_EN: Record<string, string> = {
    "明日": "Tomorrow", "今夜": "Tonight", "来週": "Next week",
    "週末": "This weekend", "金曜日": "On Friday", "来年": "Next year",
    "今晩": "This evening", "昨日": "Yesterday", "先週": "Last week",
    "去年": "Last year", "今朝": "This morning", "土曜日": "On Saturday",
  };
  const timeWordEn = TIME_WORDS_EN[timeWord] ?? timeWord;

  // Extract the first verb stem from verbEnglish.
  // verbEnglish may be compound: "to see / to watch" → take first → "see".
  const verbStem = (ve: string) => ve.split(" / ")[0].replace(/^to /, "");
  const PAST_MAP: Record<string, string> = { go: "went", see: "saw", eat: "ate", watch: "watched" };
  const actionEn = (particle: string, verbEnglish: string, noun: string): string => {
    const stem = verbStem(verbEnglish);
    const conj = isPast ? (PAST_MAP[stem] ?? stem + "ed") : stem;
    return particle === "に" ? `${conj} to ${noun}` : `${conj} ${noun}`;
  };
  const v1En = actionEn(v.particle, v.verbEnglish, v1Row.hintEnglish);
  const v2En = actionEn(v2.particle, v2.verbEnglish, v2Row.hintEnglish);
  const answerEnglish = isPast
    ? `${timeWordEn} I ${v1En} and ${v2En}.`
    : `${timeWordEn} I will ${v1En} and ${v2En}.`;

  // --- Construct the question (same register as the answer) ---
  const q1Word = v.particle === "に" ? "どこに" : "何を";
  const q2Word = v2.particle === "に" ? "どこに" : "何を";
  const q1RomajiWord = v.particle === "に" ? "doko ni" : "nani o";
  const q2RomajiWord = v2.particle === "に" ? "doko ni" : "nani o";

  // Polite questions end with か, casual questions end with ?
  if (isPolite) {
    const question = `${timeWord}、${q1Word}${teFormKanji}、${q2Word}${finalVerbKanji}か？`;
    const questionRomaji = `${timeWord}, ${q1RomajiWord} ${teFormRomaji}, ${q2RomajiWord} ${finalVerbRomaji} ka?`;
    const q1En = v.particle === "に" ? (isPast ? "where did you go" : "where will you go") : (isPast ? `what did you ${verbStem(v.verbEnglish)}` : `what will you ${verbStem(v.verbEnglish)}`);
    const q2En = v2.particle === "に" ? (isPast ? "where did you go" : "where will you go") : (isPast ? `what did you ${verbStem(v2.verbEnglish)}` : `what will you ${verbStem(v2.verbEnglish)}`);
    const questionEnglish = `${timeWordEn}, ${q1En} and ${q2En}?`;

    const formLabel = `Combine (te → ${isPast ? "polite past" : "polite present"})`;
    return {
      state: formLabel,
      question, questionRomaji, questionEnglish,
      hintKeyword: noun2, hintKeywordRomaji: v2Row.hintKeywordRomaji, hintEnglish: v2Row.hintEnglish,
      answer, answerRomaji, answerEnglish,
      strictVerb: strictVerb1,
      secondVerb: v2.verb, secondVerbRomaji: v2.verbRomaji, secondVerbEnglish: v2.verbEnglish,
      strictVerb2,
    };
  } else {
    const question = `${timeWord}、${q1Word}${teFormKanji}、${q2Word}${finalVerbKanji}？`;
    const questionRomaji = `${timeWord}, ${q1RomajiWord} ${teFormRomaji}, ${q2RomajiWord} ${finalVerbRomaji}?`;
    const q1En = v.particle === "に" ? (isPast ? "where did you go" : "where are you going") : (isPast ? `what did you ${verbStem(v.verbEnglish)}` : `what will you ${verbStem(v.verbEnglish)}`);
    const q2En = v2.particle === "に" ? (isPast ? "where did you go" : "where are you going") : (isPast ? `what did you ${verbStem(v2.verbEnglish)}` : `what will you ${verbStem(v2.verbEnglish)}`);
    const questionEnglish = `${timeWordEn}, ${q1En} and ${q2En}?`;

    const formLabel = `Combine (te → ${isPast ? "casual past" : "casual present"})`;
    return {
      state: formLabel,
      question, questionRomaji, questionEnglish,
      hintKeyword: noun2, hintKeywordRomaji: v2Row.hintKeywordRomaji, hintEnglish: v2Row.hintEnglish,
      answer, answerRomaji, answerEnglish,
      strictVerb: strictVerb1,
      secondVerb: v2.verb, secondVerbRomaji: v2.verbRomaji, secondVerbEnglish: v2.verbEnglish,
      strictVerb2,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Generate the question set for a verb (10 core + 1 combine = 11).
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

  // Core 10 forms come from the CSV bank.
  const coreQuestions = FORMS.slice(0, CORE_FORMS).map((form) => {
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

  // The bonus combine question is generated programmatically.
  const combineQuestion = generateCombineQuestion(verbKey, rng);

  return [...coreQuestions, combineQuestion];
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
  // Combine form: the second verb ending must also appear.
  if (q.strictVerb2) {
    const verb2 = normalize(q.strictVerb2);
    if (!t.includes(verb2)) {
      return { passed: false, reason: `動詞: ${q.strictVerb2} が見つかりません` };
    }
  }
  if (noun && !t.includes(noun)) {
    return { passed: false, reason: `名詞: ${q.hintKeyword} が見つかりません` };
  }
  return { passed: true, reason: "正解" };
}
