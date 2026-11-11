import { onlineManager } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { useSaveAnswers, type AnswerInput } from "../../hooks/use-quizzes";
import { isAnswered, toAnswerInput, type DraftAnswer } from "./answer-model";

/**
 * How long after the last edit the pending answers are flushed.
 *
 * v1 saved each answer fire-and-forget and relied on re-saving everything at
 * submit to cover the losses (R55, R56). On a phone that assumption breaks: the
 * app is backgrounded, the network drops mid-quiz, and the "one sitting" never
 * happens — and because an IN_PROGRESS attempt has no expiry (R47) and blocks
 * the student from ever starting again (R45), a lost save is not a lost answer,
 * it is a stuck student. So: a real debounce, a batched PATCH, and a visible
 * save state.
 */
const SAVE_DEBOUNCE_MS = 1000;

type SaveState = "idle" | "saving" | "saved" | "error";

/** The in-progress attempt's answers, saved in debounced batches. */
export function useQuizAnswers(detail: StudentQuizDetail, quizId: number) {
  const save = useSaveAnswers(quizId);
  const [answers, setAnswers] = useState<Record<number, DraftAnswer>>(() =>
    Object.fromEntries(detail.questions.map((q) => [q.id, q.answer])),
  );
  // Always the latest answers, readable from the debounce timer's closure.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const pendingRef = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flushes run one after another, so a slow PATCH can never land after a
  // newer one and put an older answer back on the server.
  const chainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const [saveState, setSaveState] = useState<SaveState>("idle");

  /** One PATCH of the ids pending right now; edits made meanwhile stay pending. */
  const sendPending = async (): Promise<boolean> => {
    const sent = [...pendingRef.current];
    if (sent.length === 0) return true;
    // Take exactly these ids out BEFORE the request: a question edited while
    // the request is in flight is re-added by queueSave and goes out in the
    // next flush, instead of being cleared along with the batch before it.
    for (const qid of sent) pendingRef.current.delete(qid);
    const payload: AnswerInput[] = detail.questions
      .filter((q) => sent.includes(q.id))
      .map((q) => toAnswerInput(q, answersRef.current[q.id] ?? q.answer));
    setSaveState("saving");
    try {
      await save.mutateAsync(payload);
      const settled = pendingRef.current.size === 0 && timerRef.current === null;
      setSaveState(settled ? "saved" : "saving");
      return true;
    } catch {
      // Nothing was saved: put the ids back so the next flush retries them.
      for (const qid of sent) pendingRef.current.add(qid);
      setSaveState("error");
      return false;
    }
  };

  /** One batched PATCH of everything edited since the last successful flush. */
  const flush = (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const run = chainRef.current.then(sendPending, sendPending);
    chainRef.current = run;
    return run;
  };
  // The unmount and AppState handlers outlive the render that made them.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    // Backgrounding is where a phone loses an attempt: the OS may kill the app
    // before the debounce fires, so save now rather than in a second.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") void flushRef.current();
    });
    return () => {
      sub.remove();
      // Leaving the screen inside the debounce window must not drop the edit.
      // useSaveAnswers' cache merge is hook-level, so it lands even after this
      // component is gone and a re-open shows the answer.
      if (timerRef.current !== null || pendingRef.current.size > 0) void flushRef.current();
    };
  }, []);

  const queueSave = (questionId: number) => {
    pendingRef.current.add(questionId);
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState("saving");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  };

  /** Replace a question's whole answer; the model helpers (toggleChoice, pairUp, …) build the next one. */
  const setAnswer = (q: QuizQuestionStudent, next: DraftAnswer) => {
    setAnswers((prev) => {
      const merged = { ...prev, [q.id]: next };
      answersRef.current = merged;
      return merged;
    });
    queueSave(q.id);
  };

  const isComplete = detail.questions.every((q) => {
    const a = answers[q.id];
    return a !== undefined && isAnswered(q, a);
  });

  /**
   * Offline with answers still to go, `flush` would wait for the connection,
   * because autosave is paused rather than failed. A submit awaiting it would hang,
   * then hand the quiz in on reconnect, so it asks this first.
   */
  const hasUnsentOffline = () =>
    !onlineManager.isOnline() && (pendingRef.current.size > 0 || timerRef.current !== null || save.isPending);

  return {
    answers,
    setAnswer,
    flush,
    hasUnsentOffline,
    saveState,
    isComplete,
    // A paused autosave isn't a save under way: Submit stays pressable, and says why it can't go.
    savePending: save.isPending && !save.isPaused,
  };
}
