# VerbDeck

Oral mastery of one Japanese verb at a time. A mobile-first, installable PWA built with Next.js (App Router).

The user is drilled on one verb (行く / "to go") across 10 essential conversational forms. Interaction is 100% speech-driven: the app asks a question (TTS), the user holds a mic button and speaks the answer (STT), and the app evaluates the transcript (strict verb-ending match + fuzzy noun match).

## Stack
- Next.js 14 (App Router) + React 18 + TypeScript
- PWA: `public/manifest.json` + `public/sw.js` (offline shell caching)
- Audio: browser Web Speech API by default, with pluggable hooks for Google Cloud TTS/STT (`lib/audio.ts`)

## Project structure
```
data/questions.json     Question data (separate from app logic)
lib/questions.ts        Loads JSON + evaluation logic (strict verb + fuzzy noun)
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
All question content lives in `data/questions.json` — not hardcoded in the app. Add verbs by adding JSON files and loading them.

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
