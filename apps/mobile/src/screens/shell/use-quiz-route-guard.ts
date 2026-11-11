import { router, usePathname, useSegments } from "expo-router";
import { useEffect } from "react";

import { useOpenQuizAttempt } from "../../hooks/use-quizzes";
import { useQuizLockStore } from "../../store/quiz-lock";
import { useSessionStore } from "../../store/session";

/** The one route a held student may be on. */
const heldQuizPath = (quizId: number) => `/quiz/${quizId}`;

/**
 * The relaunch lock (spec "Relaunch"): while a signed-in student has an attempt open, the app shows
 * that quiz and nothing else until it is submitted, timed out or ended. Any other route (a tab, a
 * deep link, a notification tap) goes straight back to it. Not a plain `replace`: on a tab it pushes
 * (a replace would swap out the one `(tabs)`, leaving nothing under the quiz once it lets go), and
 * above the tabs it is `dismissTo`, which pops back to the quiz when it is still on the stack (a
 * second quiz screen would run a second exit watch) and otherwise swaps the top screen as `replace`
 * does. Staff are never held. Returns the held quiz's id, or null.
 */
export function useQuizRouteGuard(): number | null {
  const isStudent = useSessionStore((s) => s.status === "authenticated" && s.user?.role === "STUDENT");
  useOpenQuizAttempt(isStudent);
  const lockedQuizId = useQuizLockStore((s) => s.lockedQuizId);
  const held = isStudent ? lockedQuizId : null;
  const pathname = usePathname();
  const onTab = (useSegments() as string[]).includes("(tabs)");

  useEffect(() => {
    if (held === null || pathname === heldQuizPath(held)) return;
    const href = { pathname: "/quiz/[id]", params: { id: String(held) } } as const;
    if (onTab) router.push(href);
    else router.dismissTo(href);
  }, [held, pathname, onTab]);

  return held;
}
