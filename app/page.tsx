"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "@iconify/react";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import {
  generateQuestions,
  evaluateAnswer,
  VERBS,
  type Question,
} from "@/lib/questions";
import {
  isRecognitionSupported,
  speak,
  startRecognition,
  stopSpeaking,
  type Recognizer,
} from "@/lib/audio";

type Phase = "intro" | "ask" | "listening" | "evaluating" | "complete";

const TOTAL = 10;

export default function Page() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [verbKey, setVerbKey] = useState("iku");
  const verb = VERBS[verbKey];
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState<boolean[]>(() =>
    Array(TOTAL).fill(false)
  );
  const [showRomaji, setShowRomaji] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"" | "ok" | "no">("");
  const [transcript, setTranscript] = useState("");
  const [seed, setSeed] = useState(0);

  const recognizerRef = useRef<Recognizer | null>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isRecognitionSupported());
  }, []);

  const currentQuestion: Question | null = questions[index] ?? null;
  const doneCount = progress.filter(Boolean).length;

  /** Romaji & English are hold-to-reveal, both off by default. While neither
   * is held we return an empty string so the reserved line never collapses. */
  const reveal = (romaji: string, english: string) =>
    showRomaji ? romaji : showEnglish ? english : "";

  /** Press-and-hold handlers: pointer down -> show, release/cancel -> hide. */
  const holdHandlers = (setter: (v: boolean) => void) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture unsupported */
      }
      setter(true);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setter(false);
    },
    onPointerCancel: () => setter(false),
  });

  // Generate questions when seed or verb changes (or on first mount).
  useEffect(() => {
    setQuestions(generateQuestions(verbKey, seed || Date.now()));
  }, [seed, verbKey]);

  const ask = useCallback(async (q: Question) => {
    setStatus("");
    setStatusTone("");
    setTranscript("");
    setShowAnswer(false);
    setPhase("ask");
  }, []);

  const goToQuestion = useCallback(
    (targetIdx: number) => {
      stopSpeaking();
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      if (targetIdx < 0 || targetIdx >= questions.length) return;
      setIndex(targetIdx);
      setShowAnswer(false);
      setStatus("");
      setStatusTone("");
      setTranscript("");
      setPhase("ask");
    },
    [questions]
  );

  const goNext = useCallback(() => {
    if (index < questions.length - 1) goToQuestion(index + 1);
  }, [index, questions.length, goToQuestion]);

  const goPrev = useCallback(() => {
    if (index > 0) goToQuestion(index - 1);
  }, [index, goToQuestion]);

  const dontKnow = useCallback(() => {
    stopSpeaking();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    const q = questions[index];
    setShowAnswer(true);
    setStatus("");
    setStatusTone("");
    setPhase("ask");
  }, [questions, index]);

  const startMic = useCallback(() => {
    const q = questions[index];
    if (!q || !supported) {
      setStatus("Speech recognition unavailable in this browser");
      setStatusTone("no");
      return;
    }
    stopSpeaking();
    setPhase("listening");
    setStatus("Speak now");
    setStatusTone("");
    setTranscript("");

    const rec = startRecognition(
      "ja-JP",
      (text) => {
        setTranscript(text);
        setPhase("evaluating");
        const result = evaluateAnswer(text, q);
        if (result.passed) {
          setStatus(result.reason);
          setStatusTone("ok");
          setShowAnswer(true);
          setProgress((prev) => {
            const next = [...prev];
            next[index] = true;
            if (next.every(Boolean)) {
              stopSpeaking();
              setPhase("complete");
            }
            return next;
          });
          setPhase("ask");
        } else {
          setStatus(result.reason || "Try again");
          setStatusTone("no");
          setShowAnswer(true);
          setPhase("ask");
        }
      },
      (err) => {
        // Empty error = onend fired with no result (silence / quick release).
        if (!err) {
          setPhase("ask");
          return;
        }
        setStatus(err || "Recognition error");
        setStatusTone("no");
        setPhase("ask");
      }
    );
    recognizerRef.current = rec;
    rec.start();
  }, [questions, index, supported]);

  const stopMic = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
  }, []);

  const beginDialogue = useCallback(
    async (key: string) => {
      stopSpeaking();
      if (key !== verbKey) {
        setVerbKey(key);
        setProgress(Array(TOTAL).fill(false));
        setIndex(0);
        setStatus("");
        setStatusTone("");
        setTranscript("");
        setShowAnswer(false);
      }
      const firstUndone = progress.findIndex((v) => !v);
      const startAt = firstUndone === -1 ? 0 : firstUndone;
      setIndex(startAt);
      if (questions[startAt]) await ask(questions[startAt]);
    },
    [progress, questions, ask, verbKey]
  );

  const restart = useCallback(() => {
    stopSpeaking();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setProgress(Array(TOTAL).fill(false));
    setIndex(0);
    setStatus("");
    setStatusTone("");
    setTranscript("");
    setShowAnswer(false);
    setPhase("intro");
  }, []);

  const newSession = useCallback(() => {
    stopSpeaking();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setProgress(Array(TOTAL).fill(false));
    setIndex(0);
    setStatus("");
    setStatusTone("");
    setTranscript("");
    setShowAnswer(false);
    setSeed(Date.now());
  }, []);

  const goHome = useCallback(() => {
    stopSpeaking();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setProgress(Array(TOTAL).fill(false));
    setIndex(0);
    setStatus("");
    setStatusTone("");
    setTranscript("");
    setShowAnswer(false);
    setPhase("intro");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      recognizerRef.current?.stop();
    };
  }, []);

  // Prime voices for Web Speech API in some browsers.
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  return (
    <>
      <ServiceWorkerRegister />

      <div className="topbar">
        {phase !== "intro" && (
          <button
            type="button"
            className="topbar-btn"
            onClick={goHome}
          >
            <Icon icon="ph:caret-left-bold" /> Verbs
          </button>
        )}
        {phase !== "intro" && (
          <button
            type="button"
            className="topbar-btn"
            onClick={newSession}
            aria-label="New questions"
          >
            <Icon icon="ph:arrows-clockwise-bold" />
          </button>
        )}
      </div>

      <main className="shell">
        {phase === "complete" ? (
          <section className="complete">
            <h1>{verb.verb} — Complete</h1>
            <p>
              {doneCount} / {TOTAL} forms mastered.
            </p>
            <div className="btn-row">
              <button type="button" onClick={restart}>
                Retry Same
              </button>
              <button type="button" onClick={newSession}>
                New Questions
              </button>
            </div>
            <button type="button" className="back-btn" onClick={goHome}>
              Back to Verbs
            </button>
          </section>
        ) : phase === "intro" ? (
          <section className="intro">
            <h2 className="verb-list-title">Choose a verb</h2>

            <div className="verb-list">
              {(Object.keys(VERBS) as (keyof typeof VERBS)[]).map((key) => {
                const v = VERBS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className="verb-card"
                    onClick={() => beginDialogue(key)}
                  >
                    <span className="verb-card__kanji">{v.verb}</span>
                    <span className="verb-card__meta">[{v.particle}]</span>
                    <span className="verb-card__en">
                      {reveal(v.verbRomaji, v.verbEnglish)}
                    </span>
                  </button>
                );
              })}
            </div>

            {!supported && (
              <p className="warn">
                Note: speech recognition is not available in this browser.
                Use Chrome on desktop or Android for full functionality.
              </p>
            )}
          </section>
        ) : (
          <section className="qa">
            <div className="hero">
              <div className="kanji">{verb.verb}</div>
              <div className="english">
                {reveal(verb.verbRomaji, verb.verbEnglish)}
              </div>
            </div>

            <div className="progress">
              {progress.map((done, i) => (
                <span
                  key={i}
                  className={`dot ${i === index ? "is-active" : ""} ${
                    done ? "is-done" : ""
                  }`}
                />
              ))}
            </div>

            {currentQuestion && (
              <>
              <div className="carousel">
                <button
                  type="button"
                  className="carousel-nav carousel-nav--prev"
                  onClick={goPrev}
                  disabled={index === 0}
                  aria-label="Previous question"
                >
                  <Icon icon="ph:caret-left-bold" />
                </button>
                <div className="carousel-card">
                  <div className="state-tag">{currentQuestion.state}</div>

                <div
                  className="question question-clickable"
                  onClick={() => {
                    if (phase === "ask" && currentQuestion) {
                      stopSpeaking();
                      speak(currentQuestion.question);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {currentQuestion.question}
                  <div className="english">
                    {reveal(
                      currentQuestion.questionRomaji,
                      currentQuestion.questionEnglish
                    )}
                  </div>
                </div>

                <div
                  className="instruction instruction-clickable"
                  onClick={() => {
                    if (phase === "ask" && currentQuestion) {
                      stopSpeaking();
                      speak(currentQuestion.hintKeyword);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="instruction-ja">
                    {currentQuestion.hintKeyword}
                  </div>
                  <div className="english">
                    {reveal(
                      currentQuestion.hintKeywordRomaji,
                      currentQuestion.hintEnglish
                    )}
                  </div>
                </div>

                {showAnswer ? (
                  <div
                    className="answer-box answer-clickable"
                    onClick={() => {
                      if (currentQuestion) {
                        stopSpeaking();
                        speak(currentQuestion.answer);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="answer-ja">{currentQuestion.answer}</div>
                    <div className="english">
                      {reveal(
                        currentQuestion.answerRomaji,
                        currentQuestion.answerEnglish
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="answer-box answer-placeholder" aria-hidden="true" />
                )}

                {transcript && (
                  <div className="transcript">
                    You said: {transcript}
                  </div>
                )}

                <div className={`status ${statusTone}`}>
                  {statusTone === "ok"
                    ? "Correct"
                    : statusTone === "no"
                    ? "Wrong"
                    : status}
                </div>
                </div>
                <button
                  type="button"
                  className="carousel-nav carousel-nav--next"
                  onClick={goNext}
                  disabled={index === questions.length - 1}
                  aria-label="Next question"
                >
                  <Icon icon="ph:caret-right-bold" />
                </button>
              </div>

              <div className="mic-wrap" aria-hidden="true" />
              </>
            )}
          </section>
        )}
      </main>

      <nav className="bottombar" aria-label="Action bar">
        <div className="bottombar-left">
          <button
            type="button"
            className={`bottombar-btn ${showRomaji ? "is-on" : ""}`}
            aria-pressed={showRomaji}
            {...holdHandlers(setShowRomaji)}
          >
            RO
          </button>
          <button
            type="button"
            className={`bottombar-btn ${showEnglish ? "is-on" : ""}`}
            aria-pressed={showEnglish}
            {...holdHandlers(setShowEnglish)}
          >
            EN
          </button>
        </div>

        <div className="bottombar-center">
          <button
            type="button"
            className={`bottombar-mic ${
              phase === "listening" ? "is-recording" : ""
            }`}
            aria-label={
              phase === "listening"
                ? "Recording — release to submit"
                : phase === "evaluating"
                ? "Evaluating"
                : "Hold to speak"
            }
            disabled={!supported || phase === "evaluating"}
            onPointerDown={(e) => {
              e.preventDefault();
              if (phase === "ask") startMic();
            }}
            onPointerUp={() => {
              if (phase === "listening") stopMic();
            }}
            onPointerCancel={() => {
              if (phase === "listening") stopMic();
            }}
          >
            {phase === "evaluating" ? (
              <Icon icon="ph:spinner-gap" className="spin" />
            ) : (
              <Icon icon="ph:microphone-bold" />
            )}
          </button>
        </div>

        <div className="bottombar-right">
          <button
            type="button"
            className="bottombar-btn"
            onClick={dontKnow}
            disabled={phase === "listening" || phase === "evaluating"}
            aria-label="Don't know"
          >
            ??
          </button>
        </div>
      </nav>
    </>
  );
}
