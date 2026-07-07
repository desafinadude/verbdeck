import ikuData from "@/data/verbs/iku.json";

/* ------------------------------------------------------------------ *
 * Data types
 * ------------------------------------------------------------------ */

export interface TimeExpression {
  ja: string;
  romaji: string;
  en: string;
}

export interface Place {
  ja: string;
  romaji: string;
  en: string;
}

export interface Conjugation {
  ja: string;
  romaji: string;
  en: string;
}

export interface VerbData {
  verb: string;
  verbRomaji: string;
  verbEnglish: string;
  particle: string;
  particleEnglish: string;
  conjugations: Record<string, Conjugation>;
  timeExpressions: TimeExpression[];
  places: Place[];
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
 * Verb registry — add more verbs here as more JSON files are created
 * ------------------------------------------------------------------ */

export const VERBS: Record<string, VerbData> = {
  iku: ikuData as VerbData,
};

/* ------------------------------------------------------------------ *
 * Question generation engine
 *
 * The engine takes a VerbData file and produces 10 questions — one per
 * grammatical form — using a time expression and a place drawn from the
 * vocabulary pools. Each form has its own question template so the
 * wording matches the conjugation naturally.
 * ------------------------------------------------------------------ */

interface FormDef {
  /** key into VerbData.conjugations */
  key: string;
  /** human label shown in the UI */
  label: string;
  /** produces the question (ja), romaji, and english given a time + place */
  question: (t: TimeExpression, p: Place, v: VerbData) => { ja: string; romaji: string; en: string };
  /** produces the expected answer given a place + conjugation */
  answer: (p: Place, c: Conjugation, v: VerbData) => { ja: string; romaji: string; en: string };
  /**
   * Which tenses are valid for this form, matched against TimeExpression.en.
   * e.g. past forms only make sense with past/yesterday/today contexts.
   * "any" means no filtering.
   */
  validTimes?: string[];
}

const PAST_HINTS = ["yesterday", "last week", "last year", "this morning"];
const FUTURE_HINTS = ["tomorrow", "tonight", "next week", "next year", "this evening", "weekend"];

const FORMS: FormDef[] = [
  {
    key: "polite_present_pos",
    label: "Polite Present (+)",
    validTimes: FUTURE_HINTS.concat(["today", "now"]),
    question: (t, _p, v) => ({
      ja: `${t.ja}、どこに${v.conjugations.polite_present_pos.ja}か？`,
      romaji: `${t.romaji}, doko ni ${v.conjugations.polite_present_pos.romaji} ka?`,
      en: `Where will you go ${t.en}?`,
    }),
    answer: (p, c, v) => ({
      ja: `${p.ja}${v.particle}${c.ja}。`,
      romaji: `${p.romaji} ${v.particle} ${c.romaji}.`,
      en: `I will go ${v.particleEnglish} the ${p.en}.`,
    }),
  },
  {
    key: "polite_present_neg",
    label: "Polite Present (-)",
    validTimes: FUTURE_HINTS.concat(["today", "now"]),
    question: (t, p, v) => ({
      ja: `${t.ja}、${p.ja}に${v.conjugations.polite_present_pos.ja}か？`,
      romaji: `${t.romaji}, ${p.romaji} ni ${v.conjugations.polite_present_pos.romaji} ka?`,
      en: `Will you go ${v.particleEnglish} the ${p.en} ${t.en}?`,
    }),
    answer: (_p, c, v) => ({
      ja: `いいえ、${v.conjugations.polite_present_neg.ja}。`,
      romaji: `Iie, ${c.romaji}.`,
      en: `No, I will not go.`,
    }),
  },
  {
    key: "polite_past_pos",
    label: "Polite Past (+)",
    validTimes: PAST_HINTS.concat(["today"]),
    question: (t, _p, v) => ({
      ja: `${t.ja}、どこに${v.conjugations.polite_past_pos.ja}か？`,
      romaji: `${t.romaji}, doko ni ${v.conjugations.polite_past_pos.romaji} ka?`,
      en: `Where did you go ${t.en}?`,
    }),
    answer: (p, c, v) => ({
      ja: `${p.ja}${v.particle}${c.ja}。`,
      romaji: `${p.romaji} ${v.particle} ${c.romaji}.`,
      en: `I went ${v.particleEnglish} the ${p.en}.`,
    }),
  },
  {
    key: "polite_past_neg",
    label: "Polite Past (-)",
    validTimes: PAST_HINTS.concat(["today"]),
    question: (t, p, v) => ({
      ja: `${t.ja}、${p.ja}に${v.conjugations.polite_past_pos.ja}か？`,
      romaji: `${t.romaji}, ${p.romaji} ni ${v.conjugations.polite_past_pos.romaji} ka?`,
      en: `Did you go ${v.particleEnglish} the ${p.en} ${t.en}?`,
    }),
    answer: (_p, c, v) => ({
      ja: `いいえ、${v.conjugations.polite_past_neg.ja}。`,
      romaji: `Iie, ${c.romaji}.`,
      en: `No, I did not go.`,
    }),
  },
  {
    key: "casual_present_pos",
    label: "Casual Present (+)",
    validTimes: FUTURE_HINTS.concat(["today", "now"]),
    question: (t, _p, v) => ({
      ja: `${t.ja}、どこに${v.conjugations.casual_present_pos.ja}？`,
      romaji: `${t.romaji}, doko ni ${v.conjugations.casual_present_pos.romaji}?`,
      en: `Where are you going ${t.en}?`,
    }),
    answer: (p, c, v) => ({
      ja: `${p.ja}${v.particle}${c.ja}。`,
      romaji: `${p.romaji} ${v.particle} ${c.romaji}.`,
      en: `Going ${v.particleEnglish} the ${p.en}.`,
    }),
  },
  {
    key: "casual_present_neg",
    label: "Casual Present (-)",
    validTimes: FUTURE_HINTS.concat(["today", "now"]),
    question: (t, p, v) => ({
      ja: `${t.ja}、${p.ja}に${v.conjugations.casual_present_pos.ja}？`,
      romaji: `${t.romaji}, ${p.romaji} ni ${v.conjugations.casual_present_pos.romaji}?`,
      en: `Going ${v.particleEnglish} the ${p.en} ${t.en}?`,
    }),
    answer: (_p, c, v) => ({
      ja: `ううん、${v.conjugations.casual_present_neg.ja}。`,
      romaji: `Uun, ${c.romaji}.`,
      en: `Nah, not going.`,
    }),
  },
  {
    key: "casual_past_pos",
    label: "Casual Past (+)",
    validTimes: PAST_HINTS.concat(["today"]),
    question: (t, _p, v) => ({
      ja: `${t.ja}、どこに${v.conjugations.casual_past_pos.ja}？`,
      romaji: `${t.romaji}, doko ni ${v.conjugations.casual_past_pos.romaji}?`,
      en: `Where did you go ${t.en}?`,
    }),
    answer: (p, c, v) => ({
      ja: `${p.ja}${v.particle}${c.ja}。`,
      romaji: `${p.romaji} ${v.particle} ${c.romaji}.`,
      en: `Went ${v.particleEnglish} the ${p.en}.`,
    }),
  },
  {
    key: "casual_past_neg",
    label: "Casual Past (-)",
    validTimes: PAST_HINTS.concat(["today"]),
    question: (t, p, v) => ({
      ja: `${t.ja}、${p.ja}に${v.conjugations.casual_past_pos.ja}？`,
      romaji: `${t.romaji}, ${p.romaji} ni ${v.conjugations.casual_past_pos.romaji}?`,
      en: `Did you go ${v.particleEnglish} the ${p.en} ${t.en}?`,
    }),
    answer: (_p, c, v) => ({
      ja: `ううん、${v.conjugations.casual_past_neg.ja}。`,
      romaji: `Uun, ${c.romaji}.`,
      en: `Nah, didn't go.`,
    }),
  },
  {
    key: "te_request",
    label: "Te-Form (Request)",
    question: (_t, _p, _v) => ({
      ja: `道が分かりません。`,
      romaji: `Michi ga wakarimasen.`,
      en: `I don't know the way.`,
    }),
    answer: (p, c, v) => ({
      ja: `あそこ${v.particle}${c.ja}。`,
      romaji: `Asoko ${v.particle} ${c.romaji}.`,
      en: `Please go over there.`,
    }),
  },
  {
    key: "te_continuous",
    label: "Te-Form (Continuous)",
    validTimes: ["now", "today"],
    question: (t, _p, v) => ({
      ja: `${t.ja}、どこに${v.conjugations.te_continuous.ja}か？`,
      romaji: `${t.romaji}, doko ni ${v.conjugations.te_continuous.romaji} ka?`,
      en: `Where are you going ${t.en}?`,
    }),
    answer: (p, c, v) => ({
      ja: `${p.ja}${v.particle}${c.ja}。`,
      romaji: `${p.romaji} ${v.particle} ${c.romaji}.`,
      en: `I am going ${v.particleEnglish} the ${p.en}.`,
    }),
  },
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
 * Generate the 10-question set for a verb.
 *
 * @param verbKey   key into VERBS (e.g. "iku")
 * @param seed      numeric seed for reproducible picks (default: Date.now)
 * ------------------------------------------------------------------ */

export function generateQuestions(verbKey: string, seed?: number): Question[] {
  const v = VERBS[verbKey];
  if (!v) throw new Error(`Unknown verb: ${verbKey}`);

  const rng = mulberry32(seed ?? Date.now());
  const usedTimes = new Set<string>();
  const usedPlaces = new Set<string>();

  return FORMS.map((form) => {
    const conj = v.conjugations[form.key];
    if (!conj) throw new Error(`Missing conjugation: ${form.key}`);

    // Pick a time expression valid for this form, avoiding repeats.
    const pool = form.validTimes
      ? v.timeExpressions.filter((t) => form.validTimes!.includes(t.en))
      : v.timeExpressions;
    const availTime = pool.filter((t) => !usedTimes.has(t.ja));
    const time = availTime.length > 0 ? pick(availTime, rng) : pick(pool, rng);
    usedTimes.add(time.ja);

    // Pick a place, avoiding repeats.
    const availPlace = v.places.filter((p) => !usedPlaces.has(p.ja));
    const place = availPlace.length > 0 ? pick(availPlace, rng) : pick(v.places, rng);
    usedPlaces.add(place.ja);

    const q = form.question(time, place, v);
    const a = form.answer(place, conj, v);

    // The strict fragment is always: particle + conjugation (e.g. に行きます)
    const strictVerb = `${v.particle}${conj.ja}`;

    // For negative forms the hint is the negation word, not the place.
    const isNeg = form.key.includes("_neg");
    const hintKeyword = isNeg ? (form.key.startsWith("polite") ? "いいえ" : "ううん") : place.ja;
    const hintKeywordRomaji = isNeg ? (form.key.startsWith("polite") ? "iie" : "uun") : place.romaji;
    const hintEnglish = isNeg ? (form.key.startsWith("polite") ? "no" : "no (casual)") : place.en;

    return {
      state: form.label,
      question: q.ja,
      questionRomaji: q.romaji,
      questionEnglish: q.en,
      hintKeyword,
      hintKeywordRomaji,
      hintEnglish,
      answer: a.ja,
      answerRomaji: a.romaji,
      answerEnglish: a.en,
      strictVerb,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Evaluation logic — strict verb-ending + fuzzy noun.
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
