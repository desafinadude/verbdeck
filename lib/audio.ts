"use client";

/**
 * Audio engine for VerbDeck.
 *
 * Brief spec calls for Google Cloud TTS (output) and Google Cloud STT
 * (ja-JP input). To keep the to-go MVP runnable offline without leaking
 * API keys, this module prefers the browser-native Web Speech APIs and
 * exposes hooks (setCloudTts / setCloudStt) so a server-provided Google
 * Cloud implementation can be dropped in without touching the UI layer.
 */

export type CloudTtsFn = (text: string) => Promise<void>;
export type CloudSttFn = (onResult: (transcript: string) => void) => {
  start: () => void;
  stop: () => void;
};

let cloudTts: CloudTtsFn | null = null;
let cloudStt: CloudSttFn | null = null;

export function setCloudTts(fn: CloudTtsFn | null) {
  cloudTts = fn;
}
export function setCloudStt(fn: CloudSttFn | null) {
  cloudStt = fn;
}

/* ----------------------- TTS (speak Japanese) ----------------------- */

export function speak(text: string, lang = "ja-JP"): Promise<void> {
  if (cloudTts) return cloudTts(text);

  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.95;
    u.pitch = 1;
    // Prefer a Japanese voice if available.
    const voices = window.speechSynthesis.getVoices();
    const ja =
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("ja")) ||
      null;
    if (ja) u.voice = ja;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

/* ----------------------- STT (recognize Japanese) ----------------------- */

/** Minimal interface returned by startRecognition() for the UI to drive. */
export interface Recognizer {
  start: () => void;
  stop: () => void;
  supported: boolean;
}

export function isRecognitionSupported(): boolean {
  if (cloudStt) return true;
  if (typeof window === "undefined") return false;
  return (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window
  );
}

export function startRecognition(
  lang: string,
  onResult: (transcript: string) => void,
  onError: (err: string) => void
): Recognizer {
  if (cloudStt) {
    const handle = cloudStt(onResult);
    return { start: handle.start, stop: handle.stop, supported: true };
  }

  const SR =
    (typeof window !== "undefined" &&
      ((window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition)) ||
    null;

  if (!SR) {
    onError("音声認識がサポートされていません");
    return { start: () => {}, stop: () => {}, supported: false };
  }

  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  rec.onresult = (e: any) => {
    const text = e.results?.[0]?.[0]?.transcript ?? "";
    onResult(text);
  };
  rec.onerror = (e: any) => {
    onError(e?.error || "認識エラー");
  };

  return {
    start: () => {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    supported: true,
  };
}
