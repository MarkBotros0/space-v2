import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { useOpenQuizAttempt } from "../hooks/use-quizzes";
import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { useQuizLockStore } from "../store/quiz-lock";

/* The open-attempt read sets the quiz lock (docs/rules/quiz-integrity.md "Relaunch and the route lock"). */

const get = apiClient.get as jest.Mock;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  useQuizLockStore.setState({ lockedQuizId: null });
});
afterEach(() => client.clear());

describe("useOpenQuizAttempt", () => {
  it("a newly open quiz (a reopen) re-reads that quiz, so a cached graded read can't let go of the new lock", async () => {
    const detailKey = queryKeys.quizzes.studentDetail(41);
    client.setQueryData(detailKey, { stage: "graded" });
    get.mockResolvedValue({ data: { data: { quizId: 41 } } });

    renderHook(() => useOpenQuizAttempt(true), { wrapper });

    await waitFor(() => expect(useQuizLockStore.getState().lockedQuizId).toBe(41));
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it("the quiz already held is not re-read on every answer", async () => {
    useQuizLockStore.setState({ lockedQuizId: 41 });
    const detailKey = queryKeys.quizzes.studentDetail(41);
    client.setQueryData(detailKey, { stage: "in_progress" });
    get.mockResolvedValue({ data: { data: { quizId: 41 } } });

    const { result } = renderHook(() => useOpenQuizAttempt(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
  });
});
