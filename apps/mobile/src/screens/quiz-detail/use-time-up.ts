import { onlineManager } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { reportOutcome } from "../../lib/outcome";

/**
 * What a re-read after the countdown's zero found (docs/rules/quiz-integrity.md "Timing"):
 * - `closed`: the server closed the attempt; the runner swaps to the result.
 * - `open`: the attempt is open and its deadline is still ahead on the server's clock (the phone's
 *   clock jumped forward). The read brought a fresh `serverNow`, so the countdown re-arms.
 * - `unconfirmed`: offline, the reads failed, or the server still shows it open past the deadline.
 */
export type TimeUpOutcome = "closed" | "open" | "unconfirmed";

const TIME_UP = "Time's up. Your answers were submitted.";
/** While unconfirmed and online, how often it tries again by itself. */
const RETRY_MS = 15_000;

type Phase = "running" | "closing" | "unconfirmed";

/** While `active`: `retry` when the phone comes back online, returns to the foreground, or every RETRY_MS. */
function useRetryWhile(active: boolean, retry: () => void) {
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    if (!active) return;
    const run = () => retryRef.current();
    const offOnline = onlineManager.subscribe((online) => {
      if (online) run();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    const timer = setInterval(() => {
      if (onlineManager.isOnline()) run();
    }, RETRY_MS);
    return () => {
      offOnline();
      appState.remove();
      clearInterval(timer);
    };
  }, [active]);
}

/**
 * The time-up state of an attempt form. Never a dead end: `unconfirmed` keeps the form locked with a
 * "Check again" (`checkAgain`), and re-reads by itself when the phone comes back online, returns to
 * the foreground, or every RETRY_MS. `isTimeUp` is readable from callbacks that outlive a render.
 */
export function useTimeUp({
  flush,
  hasUnsentOffline,
  readAfterDeadline,
}: {
  flush: () => Promise<boolean>;
  hasUnsentOffline: () => boolean;
  readAfterDeadline: () => Promise<TimeUpOutcome>;
}) {
  const [phase, setPhase] = useState<Phase>("running");
  const phaseRef = useRef<Phase>("running");
  const busy = useRef(false);
  const move = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  // Send what is still waiting, then re-read: the read closes the attempt on the server. Offline, a
  // flush would wait for the connection; the server already holds the last saves.
  const check = async () => {
    if (busy.current) return;
    busy.current = true;
    move("closing");
    try {
      if (!hasUnsentOffline()) await flush();
      const outcome = await readAfterDeadline();
      if (outcome === "closed") reportOutcome("success", TIME_UP);
      move(outcome === "open" ? "running" : outcome === "closed" ? "closing" : "unconfirmed");
    } finally {
      busy.current = false;
    }
  };

  const unconfirmed = phase === "unconfirmed";
  useRetryWhile(unconfirmed, () => void check());

  return {
    /** Inputs and Submit are locked: from zero until a re-read shows time is left. */
    timeUp: phase !== "running",
    unconfirmed,
    isTimeUp: () => phaseRef.current !== "running",
    /** The countdown reached zero. */
    expire: () => void check(),
    checkAgain: () => void check(),
  };
}
