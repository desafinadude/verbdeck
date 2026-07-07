"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const VERB_KEY = "iku";
const VERB = VERBS[VERB_KEY];
const TOTAL = 10;

export default function Page() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState<boolean[]>(() =>
    Array(TOTAL).fill(false)
  );
  const [showRomaji, setShowRomaji] = useState(false);
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

  // Generate questions when seed changes (or on first mount).
  useEffect(() => {
    setQuestions(generateQuestions(VERB_KEY, seed || Date.now()));
  }, [seed]);

  const ask = useCallback(async (q: Question) => {
    setStatus("");
    setStatusTone("");
    setTranscript("");
    setShowAnswer(false);
    setPhase("ask");
    await speak(q.question);
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
      speak(questions[targetIdx].question);
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
    if (q) speak(q.answer);
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
            return next;
          });
          speak(q.answer);
          setPhase("ask");
        } else {
          setStatus(result.reason || "Try again");
          setStatusTone("no");
          setShowAnswer(true);
          setPhase("ask");
          speak(q.answer);
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

  const beginDialogue = useCallback(async () => {
    stopSpeaking();
    const firstUndone = progress.findIndex((v) => !v);
    const startAt = firstUndone === -1 ? 0 : firstUndone;
    setIndex(startAt);
    if (questions[startAt]) await ask(questions[startAt]);
  }, [progress, questions, ask]);

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
    setPhase("intro");
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
            &larr; Verbs
          </button>
        )}
        {phase === "intro" && <span className="spacer" />}
        <button
          type="button"
          className={`topbar-btn romaji-btn ${showRomaji ? "is-on" : ""}`}
          onClick={() => setShowRomaji((v) => !v)}
          aria-pressed={showRomaji}
        >
          Romaji
        </button>
      </div>

      <main className="shell">
        {phase === "complete" ? (
          <section className="complete">
            <h1>{VERB.verb} — Complete</h1>
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
                    onClick={beginDialogue}
                  >
                    <span className="verb-card__kanji">{v.verb}</span>
                    <span className="verb-card__meta">[{v.particle}]</span>
                    <span className="verb-card__en">
                      {showRomaji ? v.verbRomaji : v.verbEnglish}
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
              <div className="kanji">{VERB.verb}</div>
              <div className="english">
                {showRomaji ? VERB.verbRomaji : VERB.verbEnglish}
              </div>
            </div>

            <div className="progress-row">
              <button
                type="button"
                className="nav-btn"
                onClick={goPrev}
                disabled={index === 0}
              >
                &larr;
              </button>
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
              <button
                type="button"
                className="nav-btn"
                onClick={goNext}
                disabled={index === questions.length - 1}
              >
                &rarr;
              </button>
            </div>

            {currentQuestion && (
              <>
                <div className="state">{currentQuestion.state}</div>

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
                    {showRomaji
                      ? currentQuestion.questionRomaji
                      : currentQuestion.questionEnglish}
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
                    {showRomaji
                      ? currentQuestion.hintKeywordRomaji
                      : currentQuestion.hintEnglish}
                  </div>
                </div>

                {showAnswer && (
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
                      {showRomaji
                        ? currentQuestion.answerRomaji
                        : currentQuestion.answerEnglish}
                    </div>
                  </div>
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

                {showAnswer ? (
                  <div className="mic-wrap">
                    {index === questions.length - 1 ? (
                      <button
                        type="button"
                        className="mic primary-action"
                        onClick={() => {
                          setProgress((prev) => {
                            const next = [...prev];
                            next[index] = true;
                            if (next.every(Boolean)) {
                              stopSpeaking();
                              setPhase("complete");
                            }
                            return next;
                          });
                        }}
                      >
                        Complete
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mic primary-action"
                        onClick={goNext}
                      >
                        Next &rarr;
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="action-row">
                    <button
                      type="button"
                      className={`mic ${
                        phase === "listening" ? "is-recording" : ""
                      }`}
                      aria-label="Press and hold to speak"
                      disabled={!supported || phase === "evaluating"}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (phase === "ask") startMic();
                      }}
                      onPointerUp={() => {
                        if (phase === "listening") stopMic();
                      }}
                      onPointerLeave={() => {
                        if (phase === "listening") stopMic();
                      }}
                    >
                      {phase === "listening"
                        ? "Recording"
                        : phase === "evaluating"
                        ? "Evaluating..."
                        : "Hold to Speak"}
                    </button>
                    <button
                      type="button"
                      className="dontknow-btn"
                      onClick={dontKnow}
                      disabled={phase === "listening" || phase === "evaluating"}
                    >
                      ??
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </>
  );
}
