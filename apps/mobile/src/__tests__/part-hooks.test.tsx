import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useForumComments, useForumThread, usePostComment, useSubmitForumResponse } from "../hooks/use-forum";
import {
  usePartVideo,
  useSavePartVideoProgress,
  useSubmitPartVideoAnswer,
  useVideoQuestions,
  useVideoQuestionWrites,
} from "../hooks/use-video-quiz";
import { queryKeys } from "../lib/query-keys";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const put = apiClient.put as jest.Mock;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

const thread = {
  assignmentId: 41,
  partId: 3,
  prompt: "Discuss",
  dueAt: null,
  own: { publicId: null, text: "", status: "DRAFT", wordCount: 0, posted: false },
  locked: true,
  minWords: null,
  allowComments: true,
  groupId: 5,
  posts: [],
  nextCursor: null,
};

describe("forum hooks (part paths)", () => {
  it("useForumThread reads the part's forum, and its next page by cursor", async () => {
    get.mockResolvedValue({ data: { data: { ...thread, nextCursor: "c2" } } });
    const { result } = renderHook(() => useForumThread(41, 3, true), { wrapper });
    await waitFor(() => expect(result.current.data?.pages[0]?.partId).toBe(3));
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/parts/3/forum");
    get.mockResolvedValue({ data: { data: thread } });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/parts/3/forum?cursor=c2");
  });

  it("useForumComments pages one post's comments on the part path", async () => {
    get.mockResolvedValue({ data: { data: { comments: [], nextCursor: null } } });
    const { result } = renderHook(() => useForumComments(41, 3, "p1", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/parts/3/forum/posts/p1/comments");
  });

  it("posting a response puts it on the part path and refreshes the thread, the assignment and the lists", async () => {
    put.mockResolvedValue({
      data: { data: { publicId: "w1", text: "Hi", status: "SUBMITTED", wordCount: 1, posted: true } },
    });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSubmitForumResponse(41, 3), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("Hi");
    });
    expect(put).toHaveBeenCalledWith("/api/v1/assignments/41/parts/3/forum/response", { text: "Hi" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.forum.thread(41, 3) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.detail(41) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.lists() });
  });

  it("usePostComment posts on the part path", async () => {
    post.mockResolvedValue({
      data: {
        data: {
          comment: {
            id: 1,
            authorUserId: 2,
            authorDisplayName: "Group member",
            body: "Nice",
            createdAt: "2099-01-01T00:00:00.000Z",
            canDelete: true,
          },
        },
      },
    });
    const { result } = renderHook(() => usePostComment(41, 3), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ postPublicId: "p1", body: "Nice" });
    });
    expect(post).toHaveBeenCalledWith("/api/v1/assignments/41/parts/3/forum/posts/p1/comments", { body: "Nice" });
  });
});

const progressResponse = (watchedSeconds: number, completedAt: string | null = null) => ({
  data: {
    data: {
      watchedSeconds,
      durationSeconds: 1080,
      answered: 0,
      questionCount: 0,
      correct: 0,
      furthestSeconds: watchedSeconds,
      completedAt,
    },
  },
});

describe("video part hooks", () => {
  it("usePartVideo reads the part's video", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          videoId: "dQw4w9WgXcQ",
          youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
          questions: [],
          furthestSeconds: 0,
          completedAt: null,
          earnedPoints: 0,
          totalPoints: 0,
          answeredCount: 0,
          nextQuestionId: null,
          title: "Luke 15 talk",
          durationSeconds: 1080,
          blockSkipping: true,
          watchedSeconds: 0,
          watchedIntervals: [],
        },
      },
    });
    const { result } = renderHook(() => usePartVideo(41, 1), { wrapper });
    await waitFor(() => expect(result.current.data?.title).toBe("Luke 15 talk"));
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/parts/1/video");
  });

  it("a progress report puts the ranges and position, and never throws", async () => {
    put.mockResolvedValue(progressResponse(10));
    const { result } = renderHook(() => useSavePartVideoProgress(41, 1), { wrapper });
    await act(async () => {
      await result.current.report([[0, 10]], 10);
    });
    expect(put).toHaveBeenCalledWith("/api/v1/assignments/41/parts/1/video/progress", {
      intervals: [[0, 10]],
      position: 10,
    });
  });

  it("a failed report is kept and sent again, merged, with the next tick", async () => {
    put.mockRejectedValueOnce(new Error("offline"));
    put.mockResolvedValue(progressResponse(20));
    const { result } = renderHook(() => useSavePartVideoProgress(41, 1), { wrapper });
    await act(async () => {
      await result.current.report([[0, 10]], 10);
    });
    await act(async () => {
      await result.current.report([[10, 20]], 20);
    });
    expect(put).toHaveBeenLastCalledWith("/api/v1/assignments/41/parts/1/video/progress", {
      intervals: [[0, 20]],
      position: 20,
    });
    // Sent: nothing is resent on the tick after.
    await act(async () => {
      await result.current.report([[20, 30]], 30);
    });
    expect(put).toHaveBeenLastCalledWith("/api/v1/assignments/41/parts/1/video/progress", {
      intervals: [[20, 30]],
      position: 30,
    });
  });

  it("a report made while one is in flight goes out once that one settles", async () => {
    let release: (v: unknown) => void = () => undefined;
    put.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    put.mockResolvedValue(progressResponse(20));
    const { result } = renderHook(() => useSavePartVideoProgress(41, 1), { wrapper });
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.report([[0, 10]], 10);
      await result.current.report([[10, 20]], 20);
    });
    expect(put).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(progressResponse(10));
      await first;
    });
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenLastCalledWith("/api/v1/assignments/41/parts/1/video/progress", {
      intervals: [[10, 20]],
      position: 20,
    });
  });

  it("refreshes the assignment once the video counts as done", async () => {
    put.mockResolvedValue(progressResponse(1000, "2099-01-01T00:00:00.000Z"));
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSavePartVideoProgress(41, 1), { wrapper });
    await act(async () => {
      await result.current.report([[0, 1000]], 1000);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.detail(41) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.lists() });
  });

  it("an answer posts on the part path and refreshes the video and the assignment", async () => {
    post.mockResolvedValue({
      data: {
        data: { isCorrect: true, correctIndex: 1, furthestSeconds: 30, completedAt: null, nextQuestionId: null },
      },
    });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSubmitPartVideoAnswer(41, 1), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ questionId: 9, selectedIndex: 1 });
    });
    expect(post).toHaveBeenCalledWith("/api/v1/assignments/41/parts/1/video/answers", {
      questionId: 9,
      selectedIndex: 1,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.videoQuiz.part(41, 1) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.assignments.detail(41) });
  });

  it("question authoring reads and writes the part's questions for a part owner", async () => {
    get.mockResolvedValue({ data: { data: { questions: [] } } });
    const owner = { kind: "part", assignmentId: 41, partId: 1 } as const;
    const list = renderHook(() => useVideoQuestions(owner, true), { wrapper });
    await waitFor(() => expect(list.result.current.data).toEqual([]));
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/parts/1/video-questions");

    post.mockResolvedValue({
      data: {
        data: {
          question: {
            id: 9,
            atSeconds: 30,
            prompt: "Who?",
            options: ["a", "b"],
            correctIndex: 0,
            points: 1,
            responseCount: 0,
          },
        },
      },
    });
    const writes = renderHook(() => useVideoQuestionWrites(owner), { wrapper });
    const input = { atSeconds: 30, prompt: "Who?", options: ["a", "b"], correctIndex: 0, points: 1 };
    await act(async () => {
      await writes.result.current.create.mutateAsync(input);
    });
    expect(post).toHaveBeenCalledWith("/api/v1/assignments/41/parts/1/video-questions", input);
  });

  it("a session owner keeps the session's question paths", async () => {
    get.mockResolvedValue({ data: { data: { questions: [] } } });
    const { result } = renderHook(() => useVideoQuestions({ kind: "session", sessionId: 8 }, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/api/v1/sessions/8/video-questions");
  });
});
