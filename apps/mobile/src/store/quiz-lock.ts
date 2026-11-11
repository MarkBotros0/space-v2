import { create } from "zustand";

interface QuizLockState {
  /** The quiz whose attempt is open on screen, or null. Read outside React by the notification handler. */
  openAttemptQuizId: number | null;
  setOpenAttempt: (quizId: number | null) => void;
}

export const useQuizLockStore = create<QuizLockState>((set) => ({
  openAttemptQuizId: null,
  setOpenAttempt: (quizId) => set({ openAttemptQuizId: quizId }),
}));
