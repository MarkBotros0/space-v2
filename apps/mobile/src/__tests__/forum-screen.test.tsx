// apps/mobile/src/__tests__/forum-screen.test.tsx
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41", partId: "3" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { assignmentDetail, forumPart, forumWork } from "./helpers/assignment-fixtures";
import { renderWithProviders } from "./helpers/render";

import PartScreen from "../../app/(app)/assignment/[id]/part/[partId]";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const post = apiClient.post as jest.Mock;

const forumAssignment = assignmentDetail([forumWork(false)], {
  title: "Week three discussion",
  description: null,
  // Org midnight on Apr 1 (Cairo, UTC+2): the screen renders the server's org day, never dueAt.
  dueAt: "2099-03-31T22:00:00.000Z",
  dueOrgDay: "2099-04-01",
  dueOrgTime: null,
  parts: [forumPart],
});

const lockedView = {
  assignmentId: 41,
  partId: 3,
  prompt: forumPart.prompt,
  dueAt: forumAssignment.dueAt,
  own: {
    publicId: null,
    text: "",
    status: "DRAFT" as const,
    wordCount: 0,
    posted: false,
  },
  locked: true,
  minWords: 5,
  allowComments: true,
  groupId: 3,
  posts: [],
  nextCursor: null,
};

const unlockedView = {
  ...lockedView,
  own: {
    publicId: "abc123defg",
    text: "space-v2-test my response one two three",
    status: "SUBMITTED" as const,
    wordCount: 7,
    posted: true,
  },
  locked: false,
  posts: [
    {
      publicId: "peer000001",
      studentUserId: 12,
      authorDisplayName: "Group member",
      text: "space-v2-test peer response",
      submittedAt: "2099-03-02T10:00:00.000Z",
      commentCount: 1,
      comments: [
        {
          id: 5,
          authorUserId: 9,
          authorDisplayName: "Test student",
          body: "space-v2-test my comment",
          createdAt: "2099-03-02T11:00:00.000Z",
          canDelete: true,
        },
      ],
      canComment: true,
    },
  ],
};

const studentSession = {
  user: {
    id: 9,
    name: "Test student",
    email: "s@jpc.test",
    role: "STUDENT" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(studentSession);
});

describe("forum part screen", () => {
  it("renders the compose box and the lock state with no submission in existence", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );

    renderWithProviders(<PartScreen />);

    expect(await screen.findByLabelText("Your response")).toBeTruthy();
    // A deliberate product mechanic, not an error — it gets a real empty state.
    expect(screen.getByText("Post to unlock the discussion")).toBeTruthy();
    expect(screen.getByText("0 words · minimum 5")).toBeTruthy();
    // Nothing was created by opening the screen (ruling C6).
    expect(put).not.toHaveBeenCalled();
  });

  it("counts words with the shared counter and blocks a short post client-side", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );

    renderWithProviders(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText("Your response"), "one two three");
    expect(screen.getByText("3 words · minimum 5")).toBeTruthy();

    fireEvent.press(screen.getByText("Post response"));
    await waitFor(() => expect(put).not.toHaveBeenCalled());
  });

  it("posts through the upsert on an assignment with no row", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );
    put.mockResolvedValue({ data: { data: unlockedView.own } });

    renderWithProviders(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText("Your response"), "space-v2-test my response one two three");
    fireEvent.press(screen.getByText("Post response"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/assignments/41/parts/3/forum/response", {
        text: "space-v2-test my response one two three",
      }),
    );
  });

  it("renders peers, comment counts and a delete control the server authorised", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: unlockedView } }),
    );

    renderWithProviders(<PartScreen />);

    expect(await screen.findByText("space-v2-test peer response")).toBeTruthy();
    expect(screen.getByText("Group member")).toBeTruthy();
    expect(screen.getByText("space-v2-test my comment")).toBeTruthy();
    // canDelete comes from the server; the client never re-derives it.
    expect(screen.getByLabelText("Delete comment")).toBeTruthy();
    expect(screen.queryByText("Update response")).toBeTruthy();
    // A forum post has no review (owner): no feedback block.
    expect(screen.queryByText("Leader feedback")).toBeNull();
    expect(screen.getByText(/^Group discussion · /)).toBeTruthy();
  });

  it("deletes a comment only after the confirm dialog", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: unlockedView } }),
    );
    (apiClient.delete as jest.Mock).mockResolvedValue({ data: { data: { deleted: true } } });

    renderWithProviders(<PartScreen />);

    fireEvent.press(await screen.findByLabelText("Delete comment"));
    expect(await screen.findByText("Delete comment?")).toBeTruthy();
    // Neutral copy: a leader may remove a group member's comment, not only their own (B3-16).
    expect(screen.getByText("This removes the comment for everyone.")).toBeTruthy();
    expect(apiClient.delete).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Delete"));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledTimes(1));
  });

  it("posts a comment against the post's publicId", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: unlockedView } }),
    );
    post.mockResolvedValue({ data: { data: { comment: { id: 6 } } } });

    renderWithProviders(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText("Write a comment…"), "space-v2-test another comment");
    fireEvent.press(screen.getByLabelText("Post comment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/assignments/41/parts/3/forum/posts/peer000001/comments", {
        body: "space-v2-test another comment",
      }),
    );
  });

  it("fetches the rest of a post's comments on 'Show all comments'", async () => {
    const threeComments = {
      ...unlockedView,
      posts: [{ ...unlockedView.posts[0], commentCount: 3 }],
    };
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/assignments/41") {
        return Promise.resolve({ data: { data: forumAssignment } });
      }
      if (url === "/api/v1/assignments/41/parts/3/forum/posts/peer000001/comments") {
        return Promise.resolve({
          data: {
            data: {
              comments: [5, 6, 7].map((id) => ({
                id,
                authorUserId: 12,
                authorDisplayName: "Group member",
                body: `space-v2-test comment ${id}`,
                createdAt: "2099-03-02T11:00:00.000Z",
                canDelete: false,
              })),
              nextCursor: null,
            },
          },
        });
      }
      return Promise.resolve({ data: { data: threeComments } });
    });

    renderWithProviders(<PartScreen />);
    expect(await screen.findByText("2 more")).toBeTruthy();
    fireEvent.press(screen.getByText("Show all comments"));

    expect(await screen.findByText("space-v2-test comment 7")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/parts/3/forum/posts/peer000001/comments");
  });

  it("hides the comment block entirely when the assignment disallows comments", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: { data: { ...forumAssignment, parts: [{ ...forumPart, allowComments: false }] } },
          })
        : Promise.resolve({
            data: {
              data: {
                ...unlockedView,
                allowComments: false,
                posts: [{ ...unlockedView.posts[0], comments: [], commentCount: 0, canComment: false }],
              },
            },
          }),
    );

    renderWithProviders(<PartScreen />);
    expect(await screen.findByText("space-v2-test peer response")).toBeTruthy();
    expect(screen.queryByLabelText("Write a comment…")).toBeNull();
  });

  it("shows the part's prompt above the thread", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );
    renderWithProviders(<PartScreen />);
    expect(await screen.findByText("Share one takeaway")).toBeTruthy();
  });

  it("a finished season says whether they posted and never reads the feed", async () => {
    get.mockImplementation((url: string) => {
      if (url.includes("/forum")) throw new Error(`forum feed must not be read: ${url}`);
      return Promise.resolve({
        data: {
          data: {
            ...forumAssignment,
            readOnly: true,
            my: { submittedAt: null, staffMarked: false, parts: [forumWork(true)] },
          },
        },
      });
    });
    renderWithProviders(<PartScreen />);
    expect(
      await screen.findByText("You posted in this forum. This season has finished, so the discussion is closed."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Your response")).toBeNull();
  });

  it("offline, posting fails at once into the form's error and isn't sent on reconnect", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );
    put.mockRejectedValue(Object.assign(new Error("Network Error"), { isAxiosError: true, response: undefined }));
    renderWithProviders(<PartScreen />);
    fireEvent.changeText(await screen.findByLabelText("Your response"), "one two three four five six");
    act(() => onlineManager.setOnline(false));
    try {
      fireEvent.press(screen.getByText("Post response"));
      expect(await screen.findByText("Couldn't post your response. Try again.")).toBeTruthy();
      expect(screen.queryByText("Posting…")).toBeNull();
      expect(put).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("one two three four five six")).toBeTruthy();
    } finally {
      act(() => onlineManager.setOnline(true));
    }
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(put).toHaveBeenCalledTimes(1);
  });
});
