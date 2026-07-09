# VerbDeck

Oral mastery of one Japanese verb at a time. A mobile-first, installable PWA built with Next.js (App Router).

The user is drilled on one verb (行く / "to go") across 10 essential conversational forms. Interaction is 100% speech-driven: the app asks a question (TTS), the user holds a mic button and speaks the answer (STT), and the app evaluates the transcript (strict verb-ending match + fuzzy noun match).

## Stack
- Next.js 14 (App Router) + React 18 + TypeScript
- PWA: `public/manifest.json` + `public/sw.js` (offline shell caching)
- Audio: browser Web Speech API by default, with pluggable hooks for Google Cloud TTS/STT (`lib/audio.ts`)

## Project structure
```
data/questions/iku.csv  Hand-authored Q&A bank (one row = one complete sentence pair)
data/verbs/iku.json     Verb metadata (kanji, particle, conjugation table)
lib/questions.ts        CSV parser + round builder + evaluation logic
lib/audio.ts            TTS/STT engine with Cloud hooks
app/page.tsx            The interaction state machine + UI
app/layout.tsx          PWA metadata
app/globals.css         Minimal layout styles (aesthetic TBD)
components/ServiceWorkerRegister.tsx
public/manifest.json
public/sw.js
public/iku.svg          Placeholder background (drop real iku.jpeg into /public to override)
public/icons/           SVG sources + rasterized PNG icons
```

## Data
All question content lives in `data/questions/<verb>.csv` — not hardcoded in the app.
Each row is a complete, grammatically-correct Q&A pair (question + romaji + English,
hint keyword, answer + romaji + English, and the strict verb-ending fragment to check).
A round picks one random row per grammatical form, so every variation (subject, time,
place, long vs short answer) is exercised across sessions while every round still drills
all 10 forms. Verb metadata (kanji, particle, conjugations) lives in `data/verbs/<verb>.json`.
Add a verb by adding a CSV + a metadata JSON and registering it in `VERBS` / `BANKS` in `lib/questions.ts`.

## Getting started
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve production build
```

## Background image
The brief specifies a `iku.jpeg` background asset. Drop a real `public/iku.jpeg` in and the app will use it automatically; otherwise it falls back to `public/iku.svg`.

## Audio backends
The engine defaults to browser-native Web Speech APIs so it works offline with no credentials. To use Google Cloud, implement server routes (`/api/tts`, `/api/stt`) and call `setCloudTts` / `setCloudStt` from `lib/audio.ts` at startup. The UI layer never changes.
