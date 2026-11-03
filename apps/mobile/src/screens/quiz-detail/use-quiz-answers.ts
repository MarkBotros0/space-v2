import { useEffect, useRef, useState } from "react";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { useSaveAnswers, type AnswerInput } from "../../hooks/use-quizzes";

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

export type SaveState = "idle" | "saving" | "saved" | "error";
export type Answer = { selectedIndex: number | null; text: string };

function isAnswered(q: QuizQuestionStudent, a: Answer): boolean {
  return q.type === "MCQ" ? a.selectedIndex !== null : a.text.trim().length > 0;
}

/** The in-progress attempt's answers, saved in debounced batches. */
export function useQuizAnswers(detail: StudentQuizDetail, quizId: number) {
  const save = useSaveAnswers(quizId);
  const [answers, setAnswers] = useState<Record<number, Answer>>(() =>
    Object.fromEntries(
      detail.questions.map((q) => [q.id, { selectedIndex: q.selectedIndex, text: q.text ?? "" }]),
    ),
  );
  // Always the latest answers, readable from the debounce timer's closure.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const pendingRef = useRef<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /** One batched PATCH of everything edited since the last successful flush. */
  const flush = async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current.size === 0) return true;
    const payload: AnswerInput[] = detail.questions
      .filter((q) => pendingRef.current.has(q.id))
      .map((q) => {
        const a = answersRef.current[q.id];
        return q.type === "MCQ"
          ? { questionId: q.id, selectedIndex: a?.selectedIndex ?? null, text: null }
          : { questionId: q.id, selectedIndex: null, text: a?.text ?? "" };
      });
    setSaveState("saving");
    try {
      await save.mutateAsync(payload);
      pendingRef.current.clear();
      setSaveState("saved");
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  };

  const queueSave = (questionId: number) => {
    pendingRef.current.add(questionId);
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState("saving");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
  };

  const setAnswer = (
    q: QuizQuestionStudent,
    patch: { selectedIndex?: number | null; text?: string },
  ) => {
    setAnswers((prev) => {
      const next = {
        ...prev,
        [q.id]: {
          selectedIndex: prev[q.id]?.selectedIndex ?? null,
          text: prev[q.id]?.text ?? "",
          ...patch,
        },
      };
      answersRef.current = next;
      return next;
    });
    queueSave(q.id);
  };

  const isComplete = detail.questions.every((q) => {
    const a = answers[q.id];
    return a !== undefined && isAnswered(q, a);
  });

  return { answers, setAnswer, flush, saveState, isComplete, savePending: save.isPending };
}
