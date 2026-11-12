import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), delete: jest.fn() } }));
const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "55" }),
  useRouter: () => ({ push: mockPush, dismissTo: mockDismissTo, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentDetailScreen from "../../app/(app)/assignment/[id]/index";

const get = apiClient.get as jest.Mock;
const del = apiClient.delete as jest.Mock;

const parts = [
  {
    id: 1,
    position: 0,
    kind: "VIDEO" as const,
    title: "Welcome talk",
    youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
    videoId: "dQw4w9WgXcQ",
    blockSkipping: false,
    durationSeconds: 1080,
  },
  {
    id: 2,
    position: 1,
    kind: "ESSAY" as const,
    prompt: "Who are you in the story?",
    minWords: null,
    maxWords: null,
    maxFileSizeMb: null,
    allowedMimeCategories: [],
  },
  {
    id: 3,
    position: 2,
    kind: "FORUM" as const,
    prompt: "Share one thing you noticed",
    minWords: null,
    postToRead: true,
    allowComments: true,
  },
];

const detail = {
  id: 55,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring 2099",
  title: "Week four",
  description: "<p>Read <strong>the thing</strong> first.</p>",
  dueAt: "2099-04-01T21:59:00.000Z",
  dueOrgDay: "2099-04-01",
  dueOrgTime: "23:59",
  isOverdue: false,
  reminder: { enabled: true, days: 2, anchor: "NEXT_SESSION" as const, time: "09:00" },
  reminderLine: "Tue 30 Mar, around 9:00 AM — students who haven't finished",
  parts,
  my: null,
  canManage: true,
  readOnly: false,
};

// Sara has done everything and submitted; Omar is part-way through the video.
const progress = {
  canMark: false,
  rows: [
    {
      studentUserId: 9,
      name: "Sara Student",
      avatarPath: null,
      submittedAt: "2099-03-30T10:00:00.000Z",
      staffMark: null,
      parts: [
        {
          partId: 1,
          kind: "VIDEO" as const,
          status: "DONE" as const,
          video: { watchedSeconds: 1000, durationSeconds: 1080, answered: 4, questionCount: 4, correct: 3 },
        },
        {
          partId: 2,
          kind: "ESSAY" as const,
          status: "DONE" as const,
          essay: { publicId: "essay9aaaa", wordCount: 210, reviewStatus: "SUBMITTED" as const, feedback: null },
        },
        { partId: 3, kind: "FORUM" as const, status: "DONE" as const, forum: { posted: true } },
      ],
    },
    {
      studentUserId: 10,
      name: "Omar Student",
      avatarPath: null,
      submittedAt: null,
      staffMark: null,
      parts: [
        {
          partId: 1,
          kind: "VIDEO" as const,
          status: "IN_PROGRESS" as const,
          video: { watchedSeconds: 360, durationSeconds: 1080, answered: 0, questionCount: 4, correct: 0 },
        },
        { partId: 2, kind: "ESSAY" as const, status: "NOT_STARTED" as const },
        { partId: 3, kind: "FORUM" as const, status: "NOT_STARTED" as const, forum: { posted: false } },
      ],
    },
  ],
};

const ok = (data: unknown) => Promise.resolve({ data: { data } });

function serve(over: Partial<typeof detail> = {}, progressReply: () => Promise<unknown> = () => ok(progress)) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/assignments/55") return ok({ ...detail, ...over });
    if (url === "/api/v1/assignments/55/progress") return progressReply();
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("AssignmentDetailScreen (staff)", () => {
  it("progress lists unfinished students first with 'Video 6/18 min', 'Video: 3 of 4 correct', 'Essay: waiting review', 'Forum: posted'", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    serve({ canManage: false });
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Omar Student")).toBeTruthy();
    // Unfinished first: Omar's row comes before Sara's although the server sent Sara first.
    const names = screen.getAllByText(/^(Sara|Omar) Student$/).map((n) => n.props.children);
    expect(names).toEqual(["Omar Student", "Sara Student"]);
    expect(screen.getByText("NOT FINISHED")).toBeTruthy();
    expect(screen.getByText("FINISHED")).toBeTruthy();
    expect(screen.getByText("1 of 2 students finished")).toBeTruthy();

    // Omar: how far into the video, in words, and the parts he still owes.
    expect(screen.getByText("Video 6/18 min")).toBeTruthy();
    expect(screen.getByText("Essay: not handed in")).toBeTruthy();
    expect(screen.getByText("Forum: not posted")).toBeTruthy();
    expect(screen.getByText("3 parts left")).toBeTruthy();

    // Sara: the video's score, the essay waiting, the forum posted.
    expect(screen.getByText("Video: 3 of 4 correct")).toBeTruthy();
    expect(screen.getByText("Essay: waiting review")).toBeTruthy();
    expect(screen.getByText("Forum: posted")).toBeTruthy();
  });

  it("opens the student's essay for review from their row; a row with no essay handed in opens nothing", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    serve({ canManage: false });
    renderWithProviders(<AssignmentDetailScreen />);

    // The row speaks its name, its line and every part's mark, as a button.
    const sara = await screen.findByRole("button", { name: /^Sara Student/ });
    expect(sara.props.accessibilityLabel).toContain("Essay: waiting review");
    fireEvent.press(sara);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "essay9aaaa" } });

    expect(screen.queryByRole("button", { name: /^Omar Student/ })).toBeNull();
    // Still read as one row, with its marks.
    expect(screen.getByLabelText(/^Omar Student, 3 parts left, Video 6\/18 min/)).toBeTruthy();
  });

  it("opens a list of the essays for a student with more than one handed in, each to its own review", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    const twoEssays = [parts[1]!, { ...parts[1]!, id: 4, position: 3, prompt: "What would you change?" }];
    const lina = {
      studentUserId: 11,
      name: "Lina Student",
      avatarPath: null,
      submittedAt: "2099-03-30T10:00:00.000Z",
      staffMark: null,
      parts: [
        {
          partId: 2,
          kind: "ESSAY" as const,
          status: "DONE" as const,
          essay: { publicId: "essayLina1", wordCount: 210, reviewStatus: "SUBMITTED" as const, feedback: null },
        },
        {
          partId: 4,
          kind: "ESSAY" as const,
          status: "DONE" as const,
          essay: { publicId: "essayLina2", wordCount: 190, reviewStatus: "REVIEWED" as const, feedback: null },
        },
      ],
    };
    serve({ canManage: false, parts: twoEssays as typeof parts }, () => ok({ canMark: false, rows: [lina] }));
    renderWithProviders(<AssignmentDetailScreen />);

    // The row says honestly what it opens.
    const row = await screen.findByRole("button", { name: /^Lina Student/ });
    expect(row.props.accessibilityLabel).toMatch(/opens a list of 2 essays$/);
    fireEvent.press(row);
    expect(mockPush).not.toHaveBeenCalled();

    // One row per essay in the sheet, named as its chip.
    const sheet = within(await screen.findByTestId("sheet"));
    expect(sheet.getByText("Essays by Lina Student")).toBeTruthy();
    expect(sheet.getByRole("button", { name: "Essay 1: waiting review" })).toBeTruthy();
    fireEvent.press(sheet.getByRole("button", { name: "Essay 2: reviewed" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "essayLina2" } });
  });

  it("shows an admin the deadline, the instructions, the parts and the reminder line", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Week four")).toBeTruthy();
    expect(screen.getByText("Due Apr 1, 2099, 11:59 PM")).toBeTruthy();
    // Stored v1 HTML renders as text, never as literal tags (B3-16).
    expect(screen.queryByText(/<p>/)).toBeNull();
    expect(screen.getByText(/the thing/)).toBeTruthy();
    const list = within(screen.getByTestId("assignment-parts"));
    expect(list.getByText("Video: Welcome talk")).toBeTruthy();
    expect(list.getByText("Essay: Who are you in the story?")).toBeTruthy();
    expect(list.getByText("Forum: Share one thing you noticed")).toBeTruthy();
    expect(screen.getByText("Tue 30 Mar, around 9:00 AM — students who haven't finished")).toBeTruthy();
    expect(await screen.findByText("Omar Student")).toBeTruthy();
    // No student editor on the staff side.
    expect(screen.queryByText("Submit")).toBeNull();
  });

  it("opens the forum part to read the discussion; video and essay part rows are not links", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: /^Forum: Share one thing you noticed/ }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/assignment/[id]/part/[partId]",
      params: { id: "55", partId: "3" },
    });
    expect(screen.queryByRole("button", { name: /^Video: Welcome talk/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Essay: Who are you/ })).toBeNull();
  });

  it("edits, and deletes only on a second, confirming press", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByText("Edit"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]/edit", params: { id: "55" } });

    expect(screen.getByText("Delete assignment").props.className).toContain("text-bad");
    fireEvent.press(screen.getByText("Delete assignment"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/assignments/55"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/assignments"));
  });

  it("shows the server's refusal when students have started it (409 has_submissions)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    serve();
    del.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: {
              code: "has_submissions",
              message: "Students have already started this assignment, so it can't be deleted.",
            },
          },
        },
      }),
    );
    renderWithProviders(<AssignmentDetailScreen />);

    fireEvent.press(await screen.findByText("Delete assignment"));
    fireEvent.press(screen.getByText("Really delete?"));
    expect(
      await screen.findByText("Students have already started this assignment, so it can't be deleted."),
    ).toBeTruthy();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(screen.getByText("Delete assignment")).toBeTruthy();
  });

  it("gives a LEADER the progress but no edit or delete (canManage is false)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    serve({ canManage: false });
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Omar Student")).toBeTruthy();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete assignment")).toBeNull();
  });

  it("never asks a MENTOR's device for the progress, which the server refuses them", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    serve({ canManage: false });
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("Week four")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith("/api/v1/assignments/55/progress");
    expect(screen.queryByText("Omar Student")).toBeNull();
  });

  it("says so in words when there are no students to show", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    serve({ canManage: false }, () => ok({ canMark: false, rows: [] }));
    renderWithProviders(<AssignmentDetailScreen />);

    expect(await screen.findByText("No students to show yet.")).toBeTruthy();
  });

  it("says in words why there is no progress when the server refuses it (403)", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    serve({ canManage: false }, () =>
      Promise.reject({
        isAxiosError: true,
        response: { status: 403, data: { error: { code: "forbidden", message: "x" } } },
      }),
    );
    renderWithProviders(<AssignmentDetailScreen />);

    expect(
      await screen.findByText("You don't lead a group in this season, so there's no progress to show."),
    ).toBeTruthy();
  });
});
