import { useEffect } from "react";

import { useQuizLockStore } from "../../../store/quiz-lock";

/** While `active`, the app's own foreground banners and sounds are held (see `notification-presentation`). */
export function useNotificationHold(active: boolean, quizId: number) {
  useEffect(() => {
    if (!active) return;
    useQuizLockStore.getState().setOpenAttempt(quizId);
    return () => useQuizLockStore.getState().setOpenAttempt(null);
  }, [active, quizId]);
}
