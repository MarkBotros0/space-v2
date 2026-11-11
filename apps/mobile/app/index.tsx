import { Redirect } from "expo-router";

import { useQuizLockStore } from "../src/store/quiz-lock";
import { useSessionStore } from "../src/store/session";

export default function Index() {
  const status = useSessionStore((s) => s.status);
  const isStudent = useSessionStore((s) => s.user?.role === "STUDENT");
  // The last known open attempt (spec "Relaunch"): straight into the quiz, even with no signal.
  const lockedQuizId = useQuizLockStore((s) => s.lockedQuizId);
  if (status === "authenticated" && isStudent && lockedQuizId !== null) {
    return <Redirect href={{ pathname: "/quiz/[id]", params: { id: String(lockedQuizId) } }} />;
  }
  if (status === "authenticated") return <Redirect href="/dashboard" />;
  return <Redirect href="/login" />;
}
