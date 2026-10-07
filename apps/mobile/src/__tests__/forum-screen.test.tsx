// apps/mobile/src/__tests__/forum-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const post = apiClient.post as jest.Mock;

const forumAssignment = {
  id: 41,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  sessionId: null,
  sessionTitle: null,
  title: "Week three discussion",
  description: null,
  // Org midnight on Apr 1 (Cairo, UTC+2). Plan 5's detail carries the
  // server's org day/time and the screen renders those, never dueAt.
  dueAt: "2099-03-31T22:00:00.000Z",
  dueOrgDay: "2099-04-01",
  dueOrgTime: null,
  isOverdue: false,
  isAllGroups: true,
  type: "FORUM" as const,
  forumMinWords: 5,
  forumAllowComments: true,
  maxFileSizeMb: null,
  allowedMimeCategories: [],
  groupIds: null,
  mySubmission: null,
  canManage: false,
};

const lockedView = {
  assignmentId: 41,
  dueAt: forumAssignment.dueAt,
  own: {
    submissionPublicId: null,
    text: "",
    status: "DRAFT" as const,
    wordCount: 0,
    posted: false,
    feedback: null,
    reviewedAt: null,
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
    submissionPublicId: "abc123defg",
    text: "space-v2-test my response one two three",
    status: "REVIEWED" as const,
    wordCount: 7,
    posted: true,
    feedback: "space-v2-test leader feedback",
    reviewedAt: "2099-03-03T09:00:00.000Z",
  },
  locked: false,
  posts: [
    {
      submissionPublicId: "peer000001",
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

describe("forum branch of the assignment screen", () => {
  it("renders the compose box and the lock state with no submission in existence", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByLabelText("Your response")).toBeTruthy();
    // A deliberate product mechanic, not an error — it gets a real empty state.
    expect(screen.getByText("Post to unlock the discussion")).toBeTruthy();
    expect(screen.getByText("0 / 5 words")).toBeTruthy();
    // v1's FORUM branch shows no due date at all (spec 14 R33).
    expect(screen.getByText("Due Apr 1, 2099")).toBeTruthy();
    // Nothing was created by opening the screen (ruling C6).
    expect(put).not.toHaveBeenCalled();
  });

  it("counts words with the shared counter and blocks a short post client-side", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: lockedView } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.changeText(await screen.findByLabelText("Your response"), "one two three");
    expect(screen.getByText("3 / 5 words")).toBeTruthy();

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

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.changeText(
      await screen.findByLabelText("Your response"),
      "space-v2-test my response one two three",
    );
    fireEvent.press(screen.getByText("Post response"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/assignments/41/forum/response", {
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

    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("space-v2-test peer response")).toBeTruthy();
    expect(screen.getByText("Group member")).toBeTruthy();
    expect(screen.getByText("space-v2-test my comment")).toBeTruthy();
    // canDelete comes from the server; the client never re-derives it.
    expect(screen.getByLabelText("Delete comment")).toBeTruthy();
    expect(screen.queryByText("Update response")).toBeTruthy();
    // v1 never renders feedback on a forum assignment, so a leader's verdict is
    // invisible to the student who wrote the post (spec 14 R34 / D9).
    expect(screen.getByText("space-v2-test leader feedback")).toBeTruthy();
  });

  it("posts a comment against the post's publicId", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: forumAssignment } })
        : Promise.resolve({ data: { data: unlockedView } }),
    );
    post.mockResolvedValue({ data: { data: { comment: { id: 6 } } } });

    renderWithProviders(<AssignmentDetailScreen />);
    fireEvent.changeText(
      await screen.findByLabelText("Add a comment"),
      "space-v2-test another comment",
    );
    fireEvent.press(screen.getByText("Comment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/assignments/41/forum/posts/peer000001/comments", {
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
      if (url === "/api/v1/assignments/41/forum/posts/peer000001/comments") {
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

    renderWithProviders(<AssignmentDetailScreen />);
    expect(await screen.findByText("2 more")).toBeTruthy();
    fireEvent.press(screen.getByText("Show all comments"));

    expect(await screen.findByText("space-v2-test comment 7")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/assignments/41/forum/posts/peer000001/comments");
  });

  it("hides the comment block entirely when the assignment disallows comments", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({
            data: { data: { ...forumAssignment, forumAllowComments: false } },
          })
        : Promise.resolve({
            data: {
              data: {
                ...unlockedView,
                allowComments: false,
                posts: [
                  { ...unlockedView.posts[0], comments: [], commentCount: 0, canComment: false },
                ],
              },
            },
          }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    expect(await screen.findByText("space-v2-test peer response")).toBeTruthy();
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
  });

  it("does not render the forum branch for a STANDARD assignment", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/assignments/41"
        ? Promise.resolve({ data: { data: { ...forumAssignment, type: "STANDARD" } } })
        : Promise.resolve({ data: { data: lockedView } }),
    );

    renderWithProviders(<AssignmentDetailScreen />);
    await screen.findByText("Week three discussion");
    expect(get).not.toHaveBeenCalledWith("/api/v1/assignments/41/forum");
  });
});
