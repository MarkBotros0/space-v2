import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/** secure-store keys allow only letters, digits, `.`, `-` and `_`. */
const LOCKED_KEY = "quiz-route-lock";

interface QuizLockState {
  /** The quiz whose attempt is open on screen, or null. Read outside React by the notification handler. */
  openAttemptQuizId: number | null;
  setOpenAttempt: (quizId: number | null) => void;
  /**
   * The quiz the student is held on (spec "Relaunch"): the server's open attempt, or the runner's
   * own read of one. Set while the attempt is IN_PROGRESS (a reopened one awaiting its start too),
   * so unlike `openAttemptQuizId` it doesn't follow the form mounting. Kept in secure storage so an
   * online launch opens into the quiz before the server answers, and a failed open-attempt read keeps
   * it; an offline cold start goes to sign-in, which clears it (docs/rules/quiz-integrity.md "Known limits").
   */
  lockedQuizId: number | null;
  setLockedQuiz: (quizId: number | null) => void;
}

/** Storage that fails (a locked keychain) only loses the launch head start; the server read still holds. */
function persist(quizId: number | null): void {
  const write = () =>
    quizId === null ? SecureStore.deleteItemAsync(LOCKED_KEY) : SecureStore.setItemAsync(LOCKED_KEY, String(quizId));
  void Promise.resolve()
    .then(write)
    .catch(() => undefined);
}

export const useQuizLockStore = create<QuizLockState>((set, get) => ({
  openAttemptQuizId: null,
  setOpenAttempt: (quizId) => set({ openAttemptQuizId: quizId }),
  lockedQuizId: null,
  setLockedQuiz: (quizId) => {
    if (get().lockedQuizId === quizId) return;
    set({ lockedQuizId: quizId });
    persist(quizId);
  },
}));

/** Boot: the last known lock, before anything routes. A positive id or nothing. */
export async function restoreQuizLock(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(LOCKED_KEY);
  } catch {
    return;
  }
  const id = raw === null || raw === undefined ? NaN : Number(raw);
  if (Number.isInteger(id) && id > 0) useQuizLockStore.setState({ lockedQuizId: id });
}
