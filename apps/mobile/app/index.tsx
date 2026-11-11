import { Redirect } from "expo-router";

import { useHeldQuizId } from "../src/screens/shell/use-quiz-route-guard";
import { useSessionStore } from "../src/store/session";

export default function Index() {
  const status = useSessionStore((s) => s.status);
  // The last known open attempt (spec "Relaunch"): straight into the quiz, even with no signal.
  const heldQuizId = useHeldQuizId();
  if (heldQuizId !== null) return <Redirect href={{ pathname: "/quiz/[id]", params: { id: String(heldQuizId) } }} />;
  if (status === "authenticated") return <Redirect href="/dashboard" />;
  return <Redirect href="/login" />;
}
