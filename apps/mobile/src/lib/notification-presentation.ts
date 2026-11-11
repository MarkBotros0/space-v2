import { useQuizLockStore } from "../store/quiz-lock";

/**
 * How a push that arrives in the foreground is shown. While a quiz attempt is open nothing is
 * shown or sounded; the notification still lands in the server-side inbox (the bell), so it is
 * there to read after the attempt.
 */
export async function presentNotification() {
  const held = useQuizLockStore.getState().openAttemptQuizId !== null;
  return {
    shouldShowBanner: !held,
    shouldShowList: !held,
    shouldPlaySound: !held,
    shouldSetBadge: false,
  };
}
