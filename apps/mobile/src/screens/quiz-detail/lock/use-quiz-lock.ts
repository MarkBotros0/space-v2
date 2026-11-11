import { onlineManager } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { QuizAttemptEventInput } from "@space/shared";

import { usePostAttemptEvents } from "../../../hooks/use-quizzes";
import { useIsOnline } from "../../../lib/online";
import { exitEvent, isAttemptClosed, mountExit, serverIso } from "./exit-model";
import { claimAttempt, ExitQueue } from "./exit-queue";
import { useBackBlock, useExitWatch, useKeepAwakeWhile } from "./use-attempt-guards";
import { useCaptureLock } from "./use-capture-lock";
import { useNotificationHold } from "./use-notification-hold";

/** Attempts this run has already shown: a mount of one of these is never a cold start. */
const shownThisRun = new Set<number>();

type DrainResult = "empty" | "open" | "closed" | "failed";

/**
 * Everything that holds while an attempt is open on screen (docs/superpowers/specs/
 * 2026-11-10-quiz-question-types-and-integrity-design.md "Integrity"): capture blocked, the app's
 * own banners held, the screen awake, Android back ignored, and every leave reported. A leave is
 * queued in secure storage, sent at once when online and again on reconnect; the server counts it.
 * The warning shows on return (offline too) unless the server says the attempt has ended, when
 * the quiz is re-read and the runner shows the result. Times are sent on the server's clock.
 */
export function useQuizLock({
  quizId,
  attemptId,
  active,
  offsetMs,
}: {
  quizId: number;
  attemptId: number | null;
  active: boolean;
  /** The server's clock minus the phone's (countdown.ts). */
  offsetMs: number;
}) {
  const queue = useMemo(() => (attemptId === null ? null : new ExitQueue(attemptId)), [attemptId]);
  const on = active && queue !== null;
  const post = usePostAttemptEvents(quizId);
  const [warningOpen, setWarningOpen] = useState(false);
  const offset = useRef(offsetMs);
  offset.current = offsetMs;
  const leftAt = useRef<string | null>(null);
  const now = () => serverIso(offset.current, Date.now());

  // One report at a time; a reconnect and a return landing together go one after the other.
  const chain = useRef<Promise<DrainResult>>(Promise.resolve("empty"));
  const drainOnce = async (): Promise<DrainResult> => {
    if (queue === null || attemptId === null || !onlineManager.isOnline()) return "failed";
    try {
      const report = await queue.drain((events) => post.mutateAsync({ attemptId, events }));
      return report === null ? "empty" : isAttemptClosed(report) ? "closed" : "open";
    } catch {
      return "failed";
    }
  };
  const drain = () => (chain.current = chain.current.then(drainOnce, drainOnce));
  const report = async (event: QuizAttemptEventInput): Promise<DrainResult> => {
    await queue?.enqueue(event);
    return drain();
  };

  /** Queue an exit, report it, then warn, unless the report ended the attempt. */
  const recordExit = async (event: QuizAttemptEventInput) => {
    if ((await report(event)) !== "closed") setWarningOpen(true);
  };

  useCaptureLock(on, () => void report(exitEvent("SCREENSHOT", now(), null)));
  useNotificationHold(on, quizId);
  useKeepAwakeWhile(on);
  useBackBlock(on);

  useExitWatch(on, {
    onLeft: (at) => {
      const iso = serverIso(offset.current, at);
      leftAt.current = iso;
      void queue?.setLeft(iso);
    },
    onReturned: () => {
      const from = leftAt.current;
      leftAt.current = null;
      if (from === null || queue === null) return;
      // The marker goes first: a kill between the two then reads as a relaunch, never as two exits.
      void queue.takeLeft().then(() => recordExit(exitEvent("EXIT", from, now())));
    },
  });

  // On mount: claim this attempt, and count a leave the last run never came back from.
  useEffect(() => {
    if (!on || queue === null || attemptId === null) return;
    const coldStart = !shownThisRun.has(attemptId) && AppState.currentState !== "background";
    shownThisRun.add(attemptId);
    void (async () => {
      await claimAttempt(attemptId);
      const found = mountExit({ pendingLeftAt: await queue.takeLeft(), wasOpen: await queue.wasOpen(), coldStart });
      await queue.markOpen();
      if (found === null) return;
      const at = now();
      await recordExit(exitEvent(found.kind, found.leftAt ?? at, at));
    })();
    // Once per attempt shown: `now` reads a ref, and the queue is fixed per attempt.
  }, [on, queue, attemptId]);

  // Anything still queued goes when the phone is (back) online.
  const online = useIsOnline();
  useEffect(() => {
    if (on && online) void drain();
  }, [on, online, queue]);

  return { warningOpen, closeWarning: () => setWarningOpen(false) };
}
