# Portable Brief — Japanese Oral Mastery App (Design-Agnostic)

> This document captures the **working architecture, interaction model, and data**
> from the VerbDeck prototype so it can be ported into a different Japanese app
> that already has its own look & feel. **Visual / styling guidelines are
> intentionally omitted** — apply the destination project's existing design
> system. Only the functional, behavioural, and data-layer concerns are
> described here.

---

## 1. What this is

A **single-verb oral mastery trainer**. The user is drilled on one Japanese verb
at a time across **10 essential conversational forms** (polite/casual ×
present/past × affirmative/negative, plus two te-forms). Interaction is
**100% speech-driven**: the app asks a question out loud (TTS), the user speaks
the answer (press-and-hold mic), and the app evaluates the transcript (STT +
matching logic). No typing, no vocabulary lists, no textbook fluff.

The prototype was built as a **Next.js 14 App Router PWA** (installable,
offline-capable, mobile-first). The architecture below is framework-agnostic in
spirit; the destination project can reuse the data and logic directly and only
re-skin the UI.

---

## 2. Work completed so far (VerbDeck prototype)

A working, installable PWA was built with the following pieces. Each is
described so the destination agent can recreate or copy it.

| Layer | File (VerbDeck) | Status | Notes for porting |
| :-- | :-- | :-- | :-- |
| Page / interaction loop | `app/page.tsx` | ✅ working | The state machine described in §4. Rewrite UI with destination design; keep the phase/progress logic. |
| Question data + evaluation | `lib/questions.ts` | ✅ working | **Copy directly.** Pure data + pure functions, no UI. See §5 and §6. |
| Audio engine (TTS/STT) | `lib/audio.ts` | ✅ working | **Copy directly.** Uses Web Speech API by default with pluggable Google Cloud hooks. See §7. |
| PWA manifest | `public/manifest.json` | ✅ working | Adapt `name`, `theme_color`, `background_color`, and icon paths to the destination app. |
| Service worker | `public/sw.js` | ✅ working | Copy; update `VERSION` cache key and precache list. |
| SW registration | `components/ServiceWorkerRegister.tsx` | ✅ working | Framework-specific; reimplement if not React. |
| Root layout / meta | `app/layout.tsx` | ✅ working | Reuse the PWA meta tags (§8). |
| Global styles | `app/globals.css` | ✅ working | **Omitted from this brief** — use the destination project's design system instead. |
| Background asset | `public/iku.jpeg` | user-provided | Optional. The prototype overlays UI on a static background image. The destination app may not need this. |

### What's working
- Full 10-question loop: intro → ask → listening → evaluating → next/complete.
- Press-and-hold mic to record; release to evaluate.
- Strict verb-ending match + fuzzy noun match (see §6).
- 10-dot progress matrix; auto-advances to the next undone question.
- Romaji toggle (off by default) reveals romaji subtitles for question text.
- TTS speaks questions in `ja-JP`; STT recognises in `ja-JP`.
- Installable + offline via service worker + manifest.
- Graceful degradation when Web Speech APIs are unavailable.

### What's intentionally deferred / not yet done
- **Google Cloud TTS / STT integration.** The audio engine has pluggable hooks
  (`setCloudTts`, `setCloudStt`) but the prototype runs on browser-native Web
  Speech APIs so it works without API keys. Wiring real Google Cloud requires a
  server route to hold credentials — see §7.
- **Persistence.** Progress is in-memory only (resets on reload). Adding
  `localStorage` or IndexedDB persistence of per-verb mastery is a natural next
  step.
- **Multi-verb support.** Only 行く is implemented. The data model in §5 is
  designed to scale to many verbs (each verb = one `QUESTIONS` array); the UI
  just needs a verb picker.
- **Background image asset.** `iku.jpeg` is a user-provided image; the prototype
  falls back to an inline SVG placeholder if missing.

---

## 3. My thinking / architectural rationale

**Why a state machine in the page component?** The interaction is strictly
sequential (listen → speak → evaluate → advance), so a small finite-state
machine (`intro | ask | listening | evaluating | complete`) keeps the logic
legible and prevents overlapping audio/recording races. Keep this shape in the
destination app.

**Why press-and-hold mic instead of tap-to-toggle?** It mirrors a walkie-talkie
and gives the user explicit control over when recognition starts/stops, which
avoids the browser silently cutting off long pauses. Use `onPointerDown` /
`onPointerUp` / `onPointerLeave` (not click) for reliable touch behaviour.
Always call `preventDefault()` on pointer-down to avoid the long-press context
menu on mobile.

**Why strict verb-ending + fuzzy noun?** Japanese verb conjugation is the actual
learning target, so the verb ending must be exactly right (e.g. `に行きます` vs
`に行きません`). The noun (お寺, 東京, etc.) is just a context prop, so a
lenient "contains" match avoids penalising minor pronunciation/STT drift. This
two-tier matching is the heart of the evaluator — keep it.

**Why normalise before matching?** STT transcripts arrive with inconsistent
punctuation, full-width spaces, and trailing particles. Normalising (strip
whitespace, full-width spaces, and `。、!？` punctuation) before matching makes
the strict match reliable. See §6.

**Why Web Speech API as the default with Cloud hooks?** It lets the app run
offline with zero credentials, which is essential for a PWA, while leaving a
clean swap point for higher-quality Google Cloud voices/recognition later. The
UI layer never knows which backend is active.

**Why Romaji off by default?** Immersion. Kana/Kanji exposure is the point. The
toggle is a safety valve, not a feature — keep it discreet.

**Why precache the shell + background in the service worker?** The app must be
usable offline after first load. Navigation requests are network-first (so
updates show when online) with a cached-shell fallback; static assets are
stale-while-revalidated. Keep this strategy.

**Why `Promise.allSettled` for precaching?** The background image may not exist
yet; `allSettled` prevents a missing optional asset from nuking the whole
service worker install.

---

## 4. The interaction loop (state machine)

```
┌────────┐  beginDialogue  ┌──────┐  TTS finishes / auto ┌───────────┐
│ intro  │ ──────────────► │ ask  │ ───────────────────► │ listening │
└────────┘                 └──────┘                      └───────────┘
                             ▲ ▲                              │ release mic / onresult
                             │ │                              ▼
                             │ │                         ┌────────────┐
                             │ │ fail (re-ask)          │ evaluating │
                             │ └───────────────────────  └────────────┘
                             │                                │ pass
                             │                                ▼
                             │   next undone question   (back to ask)
                             │                                │
                             │   all 10 done                 ▼
                             └──── restart ────────────  ┌──────────┐
                                                          │ complete │
                                                          └──────────┘
```

Key behaviours to preserve:
1. On **pass**: mark the current dot done, speak a short confirmation
   (`はい、そうです。`), then after a brief beat auto-advance to the next
   undone question (skip already-completed ones).
2. On **fail**: show the reason, return to `ask`, re-speak the same question
   after a short delay. Do **not** advance.
3. On **all 10 done**: stop any TTS, show the complete state with a restart
   action.
4. **Always cancel TTS before starting recognition** (and vice versa) to avoid
   the app listening to its own voice.
5. **Auto-advance to the first undone question** when beginning a session, so
   partially-completed sessions resume correctly.
6. **Cleanup on unmount**: cancel speech synthesis and stop any active
   recogniser.

---

## 5. Data model — include these data files

These are the **only** data the destination agent needs. They are pure (no UI,
no framework binding) and can be copied verbatim.

### 5.1 `questions.ts` — the 10-question master loop for 行く (Iku)

> Copy this file as-is. It exports the `Question` interface, the `QUESTIONS`
> array, the `normalize()` helper, and the `evaluateAnswer()` function.

```ts
export interface Question {
  /** conversational state label, e.g. "Polite Present (+)" */
  state: string;
  /** question spoken + shown to the user */
  question: string;
  /** romaji of the question (shown only if Romaji toggle is on) */
  questionRomaji: string;
  /** emoji hint icon */
  hintIcon: string;
  /** keyword hint shown alongside the icon */
  hintKeyword: string;
  /** the full expected spoken answer */
  answer: string;
  /** romaji of the answer */
  answerRomaji: string;
  /** strict verb-ending fragment that must appear (absolute string match) */
  strictVerb: string;
}

/**
 * The 10-question master evaluation loop for 行く (Iku).
 * Order maps directly to the 10-dot progress grid.
 */
export const QUESTIONS: Question[] = [
  {
    state: "Polite Present (+)",
    question: "明日、どこに行きますか？",
    questionRomaji: "Ashita, doko ni ikimasu ka?",
    hintIcon: "⛩️",
    hintKeyword: "お寺",
    answer: "お寺に行きます。",
    answerRomaji: "Otera ni ikimasu.",
    strictVerb: "に行きます",
  },
  {
    state: "Polite Present (-)",
    question: "今夜、映画に行きますか？",
    questionRomaji: "Kon'ya, eiga ni ikimasu ka?",
    hintIcon: "❌",
    hintKeyword: "いいえ",
    answer: "いいえ、映画に行きません。",
    answerRomaji: "Iie, eiga ni ikimasen.",
    strictVerb: "に行きません",
  },
  {
    state: "Polite Past (+)",
    question: "昨日、どこに行きましたか？",
    questionRomaji: "Kinō, doko ni ikimashita ka?",
    hintIcon: "🗼",
    hintKeyword: "東京",
    answer: "東京に行きました。",
    answerRomaji: "Tōkyō ni ikimashita.",
    strictVerb: "に行きました",
  },
  {
    state: "Polite Past (-)",
    question: "京都に行きましたか？",
    questionRomaji: "Kyōto ni ikimashita ka?",
    hintIcon: "❌",
    hintKeyword: "いいえ",
    answer: "いいえ、京都に行きませんでした。",
    answerRomaji: "Iie, Kyōto ni ikimasen deshita.",
    strictVerb: "に行きませんでした",
  },
  {
    state: "Casual Present (+)",
    question: "明日、どこに行く？",
    questionRomaji: "Ashita, doko ni iku?",
    hintIcon: "🍜",
    hintKeyword: "ラーメン屋",
    answer: "ラーメン屋に行く。",
    answerRomaji: "Rāmen'ya ni iku.",
    strictVerb: "に行く",
  },
  {
    state: "Casual Present (-)",
    question: "今日、学校に行く？",
    questionRomaji: "Kyō, gakkō ni iku?",
    hintIcon: "❌",
    hintKeyword: "ううん",
    answer: "ううん、学校に行かない。",
    answerRomaji: "Uun, gakkō ni ikanai.",
    strictVerb: "に行かない",
  },
  {
    state: "Casual Past (+)",
    question: "昨日、どこに行った？",
    questionRomaji: "Kinō, doko ni itta?",
    hintIcon: "🌲",
    hintKeyword: "公園",
    answer: "公園に行った。",
    answerRomaji: "Kōen ni itta.",
    strictVerb: "に行った",
  },
  {
    state: "Casual Past (-)",
    question: "デパートに行った？",
    questionRomaji: "Depāto ni itta?",
    hintIcon: "❌",
    hintKeyword: "ううん",
    answer: "ううん、デパートに行かなかった。",
    answerRomaji: "Uun, depāto ni ikanakatta.",
    strictVerb: "に行かなかった",
  },
  {
    state: "Te-Form (Request)",
    question: "道が分かりません。",
    questionRomaji: "Michi ga wakarimasen.",
    hintIcon: "🗺️",
    hintKeyword: "あそこ",
    answer: "あそこに行ってください。",
    answerRomaji: "Asoko ni itte kudasai.",
    strictVerb: "に行ってください",
  },
  {
    state: "Te-Form (Continuous)",
    question: "今、どこに行っていますか？",
    questionRomaji: "Ima, doko ni itte imasu ka?",
    hintIcon: "💼",
    hintKeyword: "会社",
    answer: "会社に行っています。",
    answerRomaji: "Kaisha ni itte imasu.",
    strictVerb: "に行っています",
  },
];
```

### 5.2 The 10 grammatical forms covered

These are the **canonical 10 conversational states** every verb module should
drill. Use this as the template when adding more verbs:

1. Polite Present (+)
2. Polite Present (−)
3. Polite Past (+)
4. Polite Past (−)
5. Casual Present (+)
6. Casual Present (−)
7. Casual Past (+)
8. Casual Past (−)
9. Te-Form (Request) — `〜てください`
10. Te-Form (Continuous) — `〜ています`

### 5.3 Strict verb-ending targets (for 行く)

These are the **absolute string-match** targets the evaluator enforces. They are
already embedded in each `Question.strictVerb` above, but listed here for
clarity:

```
に行きます / に行きません / に行きました / に行きませんでした
に行く / に行かない / に行った / に行かなかった
に行ってください / に行っています
```

---

## 6. Evaluation logic — include this function

Two-tier matching: **strict on the verb ending, lenient on the noun**.

```ts
/**
 * Normalize a Japanese string: trim, collapse whitespace,
 * convert full-width spaces, and strip common punctuation.
 */
export function normalize(s: string): string {
  return s
    .replace(/\u3000/g, " ")      // ideographic space → ASCII space
    .replace(/\s+/g, "")          // drop all whitespace
    .replace(/　/g, "")           // drop any remaining full-width spaces
    .replace(/[。、,!！?？]/g, "") // drop common JP/en punctuation
    .trim();
}

/**
 * Fuzzy noun matching + strict verb-ending match.
 * Pass = transcript contains the strict verb fragment AND the hint keyword
 * (contains-style, after normalisation).
 */
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
  return { passed: true, reason: "正解！" };
}
```

**Rationale:** verb conjugation is the learning target → must be exact. The noun
is a context prop → tolerate STT drift. Keep this two-tier design.

---

## 7. Audio engine — include this module

A thin abstraction over TTS/STT that **defaults to browser-native Web Speech
APIs** and exposes pluggable hooks for Google Cloud. The UI layer calls only
`speak`, `stopSpeaking`, `startRecognition`, `isRecognitionSupported` and never
knows which backend is active.

```ts
export type CloudTtsFn = (text: string) => Promise<void>;
export type CloudSttFn = (onResult: (transcript: string) => void) => {
  start: () => void;
  stop: () => void;
};

let cloudTts: CloudTtsFn | null = null;
let cloudStt: CloudSttFn | null = null;

export function setCloudTts(fn: CloudTtsFn | null) { cloudTts = fn; }
export function setCloudStt(fn: CloudSttFn | null) { cloudStt = fn; }

/* ---- TTS ---- */
export function speak(text: string, lang = "ja-JP"): Promise<void> {
  if (cloudTts) return cloudTts(text);
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve(); return;
    }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 0.95; u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const ja = voices.find((v) => v.lang?.toLowerCase().startsWith("ja")) || null;
    if (ja) u.voice = ja;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

/* ---- STT ---- */
export interface Recognizer {
  start: () => void;
  stop: () => void;
  supported: boolean;
}

export function isRecognitionSupported(): boolean {
  if (cloudStt) return true;
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function startRecognition(
  lang: string,
  onResult: (transcript: string) => void,
  onError: (err: string) => void
): Recognizer {
  if (cloudStt) {
    const h = cloudStt(onResult);
    return { start: h.start, stop: h.stop, supported: true };
  }
  const SR = (typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;
  if (!SR) {
    onError("音声認識がサポートされていません");
    return { start: () => {}, stop: () => {}, supported: false };
  }
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  rec.onresult = (e: any) => onResult(e.results?.[0]?.[0]?.transcript ?? "");
  rec.onerror = (e: any) => onError(e?.error || "認識エラー");
  return {
    start: () => { try { rec.start(); } catch { /* already started */ } },
    stop:  () => { try { rec.stop(); } catch { /* ignore */ } },
    supported: true,
  };
}
```

### Wiring Google Cloud later (optional)
Create server-side routes that hold credentials (never expose keys client-side):
- **TTS**: a `POST /api/tts` route that calls Google Cloud Text-to-Speech with a
  `ja-JP` voice (e.g. `ja-JP-Wavenet-A/B/C/D`), returns audio bytes, and plays
  them via an `<audio>` element. Implement a `CloudTtsFn` that `fetch`es it.
- **STT**: a `POST /api/stt` route that accepts an audio Blob (from a
  `MediaRecorder`), calls Google Cloud Speech-to-Text with `languageCode: "ja-JP"`,
  and returns the transcript. Implement a `CloudSttFn` that records with
  `MediaRecorder` and posts the blob on stop.

Then call `setCloudTts(...)` / `setCloudStt(...)` at app startup. The UI never
changes.

---

## 8. PWA requirements (carry these over)

Regardless of the destination app's design, it should remain an **installable,
offline-capable PWA**:

1. **`manifest.json`** with: `name`, `short_name`, `start_url: "/"`,
   `scope: "/"`, `display: "standalone"`, `orientation: "portrait"`,
   `background_color`, `theme_color` (use the destination app's colours),
   `lang: "ja"`, `categories: ["education", "productivity"]`, and an icon set
   (192/512, both `any` and `maskable` variants).
2. **Service worker** registered on load. Strategy:
   - **Precache** the app shell + any static background asset on install (use
     `Promise.allSettled` so a missing optional asset doesn't break install).
   - **Navigation requests**: network-first, fall back to cached shell.
   - **Static assets**: stale-while-revalidate.
   - Skip cross-origin requests and HMR chunks.
3. **Meta tags** in the document head: `apple-mobile-web-app-capable`,
   `apple-mobile-web-app-status-bar-style`, `theme-color`, and a viewport with
   `viewport-fit=cover` for notched devices.
4. **Icons**: maskable + non-maskable at 192, 256, 384, 512.

---

## 9. State management summary

- **Progress**: `boolean[10]` — one flag per question, mapping 1:1 to the 10-dot
  progress grid. A session is **complete** only when all 10 are `true`.
- **`showRomaji`**: global boolean, **`false` by default**. When false, romaji
  subtitles are not rendered. Toggle via a discreet UI control.
