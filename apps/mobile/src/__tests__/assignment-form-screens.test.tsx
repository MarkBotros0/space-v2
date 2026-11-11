import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { format } from "date-fns";
import type { AssignmentDetail } from "@space/shared";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
const mockToast = jest.fn();
jest.mock("../design/ui/toaster", () => ({ toast: { success: (m: string) => mockToast(m), error: jest.fn() } }));
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import EditAssignmentScreen from "../../app/(app)/assignment/[id]/edit";
import NewAssignmentScreen from "../../app/(app)/assignment/new";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const season = {
  id: 7,
  code: "s7",
  title: "Spring 2099",
  program: "TEST",
  year: 2099,
  status: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
};
const SAVED_LINE = "Mon 30 Mar, around 9:00 AM — students who haven't finished";
const detail: AssignmentDetail = {
  id: 55,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring 2099",
  title: "Luke 15",
  description: "Read and watch",
  dueAt: "2099-04-01T21:59:00.000Z",
  dueOrgDay: "2099-04-01",
  dueOrgTime: "23:59",
  isOverdue: false,
  reminder: { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
  reminderLine: SAVED_LINE,
  parts: [
    {
      id: 11,
      position: 0,
      kind: "VIDEO",
      title: "Luke 15 talk",
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
      blockSkipping: true,
      durationSeconds: 1080,
    },
    {
      id: 12,
      position: 1,
      kind: "ESSAY",
      prompt: "What did the father do?",
      minWords: 100,
      maxWords: 300,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
    },
  ],
  my: null,
  canManage: true,
  readOnly: false,
};
/** The write body the saved assignment comes back as, unchanged. */
const bodyOf = (d: AssignmentDetail) => ({
  title: d.title,
  description: d.description,
  dueDay: d.dueOrgDay,
  dueTime: d.dueOrgTime,
  reminder: d.reminder,
  parts: d.parts.map(({ position: _p, ...p }) => {
    if (p.kind !== "VIDEO") return p;
    const { videoId: _v, ...video } = p;
    return video;
  }),
});

const ok = (data: unknown) => Promise.resolve({ data: { data } });
function serve(extra: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = { "/api/v1/seasons": { seasons: [season] }, ...extra };
  get.mockImplementation((url: string) =>
    url in table ? ok(table[url]) : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
}
const conflict = (students: number) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code: "needs_confirmation", message: "Confirm" }, students } },
  });
const footer = () => within(screen.getByTestId("screen-footer"));
const sheetBar = () => within(screen.getByTestId("sheet-save-bar"));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

describe("NewAssignmentScreen", () => {
  it("Details has Title, Instructions, Due, Reminder and no Session or Groups", async () => {
    serve();
    renderWithProviders(<NewAssignmentScreen />);
    expect(await screen.findByLabelText("Title")).toBeTruthy();
    expect(screen.getByText("Instructions")).toBeTruthy();
    expect(screen.getByLabelText("Due date")).toBeTruthy();
    expect(screen.getByLabelText("Remind students")).toBeTruthy();
    expect(screen.queryByLabelText("Linked session")).toBeNull();
    expect(screen.queryByText("Assign to")).toBeNull();
    expect(screen.queryByLabelText("Specific groups")).toBeNull();
    expect(screen.queryByText("Type")).toBeNull();
    // It never asks for the season's sessions.
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  });

  it("the reminder line updates with days, anchor and time", async () => {
    serve();
    renderWithProviders(<NewAssignmentScreen />);
    const line = () => screen.getByTestId("reminder-line").props.children;
    await screen.findByLabelText("Title");
    expect(line()).toBe("2 days before the next session, around 9:00\u00A0AM — students who haven't finished");

    fireEvent.press(screen.getByLabelText("How long before"));
    fireEvent.press(screen.getByRole("menuitem", { name: "5 days" }));
    fireEvent.press(screen.getByLabelText("Reminder hour"));
    fireEvent.press(screen.getByRole("menuitem", { name: "18" }));
    expect(line()).toBe("5 days before the next session, around 6:00\u00A0PM — students who haven't finished");

    // A due date ten days from today lets the line give the day itself.
    const due = new Date();
    due.setDate(due.getDate() + 10);
    fireEvent.press(screen.getByLabelText("Due date"));
    if (due.getMonth() !== new Date().getMonth()) fireEvent.press(screen.getByLabelText("Next month"));
    fireEvent.press(screen.getByLabelText(format(due, "PPP")));
    fireEvent.press(screen.getByLabelText("Before"));
    fireEvent.press(screen.getByRole("menuitem", { name: "The due date" }));
    const send = new Date(due);
    send.setDate(send.getDate() - 5);
    expect(line()).toBe(`${format(send, "EEE d MMM")}, around 6:00\u00A0PM — students who haven't finished`);

    fireEvent.press(screen.getByLabelText("Remind students"));
    expect(line()).toBe("No reminder goes out for this assignment.");
    expect(screen.queryByLabelText("How long before")).toBeNull();
  });

  it("'The due date' is disabled without a due date", async () => {
    serve();
    renderWithProviders(<NewAssignmentScreen />);
    await screen.findByLabelText("Title");
    fireEvent.press(screen.getByLabelText("Before"));
    expect(screen.getByRole("menuitem", { name: "The due date" }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByRole("menuitem", { name: "The next session" }).props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it("Parts shows the YouTube player once the link parses and an inline error when it doesn't", async () => {
    serve();
    renderWithProviders(<NewAssignmentScreen />);
    await screen.findByLabelText("Title");
    fireEvent.press(screen.getByRole("tab", { name: "Parts, 0 parts" }));
    expect(screen.getByText("No parts yet")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Add a video"));

    fireEvent.changeText(screen.getByLabelText("YouTube link"), "https://example.com/watch");
    expect(screen.getByLabelText("YouTube link").props.accessibilityHint).toBe("That isn't a YouTube link");
    expect(screen.queryByTestId("part-video-player")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("YouTube link"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(screen.getByLabelText("YouTube link").props.accessibilityHint).toBeUndefined();
    expect(screen.getByTestId("part-video-player")).toBeTruthy();
  });

  it("adds an essay question on Parts and creates the assignment with it", async () => {
    serve();
    post.mockResolvedValue({ data: { data: { ...detail, id: 77 } } });
    renderWithProviders(<NewAssignmentScreen />);
    fireEvent.changeText(await screen.findByLabelText("Title"), "Week 4 reflection");
    fireEvent.press(screen.getByRole("tab", { name: "Parts, 0 parts" }));
    fireEvent.press(screen.getByLabelText("Add an essay question"));
    fireEvent.changeText(screen.getByLabelText("Question"), "Who are you in the story?");
    fireEvent.changeText(screen.getByLabelText("Minimum words"), "150");
    fireEvent.changeText(screen.getByLabelText("Maximum words"), "300");
    fireEvent.press(sheetBar().getByText("Add question"));

    expect(await screen.findByText("1. Essay question")).toBeTruthy();
    expect(screen.getByText("150\u2060–\u2060300 words")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Parts, 1 part" })).toBeTruthy();
    fireEvent.press(footer().getByText("Create assignment"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/assignments", {
        title: "Week 4 reflection",
        description: null,
        dueDay: null,
        dueTime: null,
        reminder: { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
        parts: [
          {
            kind: "ESSAY",
            prompt: "Who are you in the story?",
            minWords: 150,
            maxWords: 300,
            maxFileSizeMb: null,
            allowedMimeCategories: [],
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "77" } }),
    );
  });

  it("allows one forum: + Forum is disabled once there is one, with the reason beside it", async () => {
    serve();
    renderWithProviders(<NewAssignmentScreen />);
    await screen.findByLabelText("Title");
    fireEvent.press(screen.getByRole("tab", { name: "Parts, 0 parts" }));
    fireEvent.press(screen.getByLabelText("Add a forum"));
    fireEvent.changeText(screen.getByLabelText("Prompt"), "Share one thing you learnt");
    fireEvent.press(sheetBar().getByText("Add forum"));
    expect(await screen.findByText("1. Forum")).toBeTruthy();
    expect(screen.getByLabelText("Add a forum").props.accessibilityState).toEqual({ disabled: true });
    expect(screen.getByText("One forum per assignment")).toBeTruthy();
  });

  it("a Save with no part opens Parts, which says why", async () => {
    serve();
    renderWithProviders(<NewAssignmentScreen />);
    fireEvent.changeText(await screen.findByLabelText("Title"), "Week 4 reflection");
    fireEvent.press(footer().getByText("Create assignment"));
    expect(await screen.findByText("Add at least one part")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Parts, 0 parts" }).props.accessibilityState).toEqual({ selected: true });
    expect(post).not.toHaveBeenCalled();
  });

  it("is not offered to a LEADER, whose device fetches nothing", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    renderWithProviders(<NewAssignmentScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("EditAssignmentScreen", () => {
  beforeEach(() => {
    mockParams = { id: "55" };
  });

  it("pre-fills both tabs, shows the server's reminder line, and PATCHes the whole assignment", async () => {
    serve({ "/api/v1/assignments/55": detail });
    patch.mockResolvedValue({ data: { data: { ...detail, title: "Luke 15, again", reopened: 0 } } });
    renderWithProviders(<EditAssignmentScreen />);

    fireEvent.changeText(await screen.findByDisplayValue("Luke 15"), "Luke 15, again");
    expect(screen.getByTestId("reminder-line").props.children).toBe(SAVED_LINE);
    fireEvent.press(screen.getByRole("tab", { name: "Parts, 2 parts" }));
    expect(screen.getByText("1. Video")).toBeTruthy();
    expect(screen.getByText("2. Essay question")).toBeTruthy();
    expect(screen.getByTestId("part-video-player")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Move Essay question up"));
    expect(screen.getByText("1. Essay question")).toBeTruthy();
    fireEvent.press(footer().getByText("Save changes"));

    const saved = bodyOf(detail);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/assignments/55", {
        ...saved,
        title: "Luke 15, again",
        parts: [saved.parts[1], saved.parts[0]],
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("removes a part only once the dialog's Remove is pressed", async () => {
    serve({ "/api/v1/assignments/55": detail });
    renderWithProviders(<EditAssignmentScreen />);
    await screen.findByDisplayValue("Luke 15");
    fireEvent.press(screen.getByRole("tab", { name: "Parts, 2 parts" }));
    fireEvent.press(screen.getByLabelText("Remove Video"));
    expect(screen.getByText("Remove this video?")).toBeTruthy();
    expect(screen.getByText("1. Video")).toBeTruthy();
    fireEvent.press(screen.getByText("Remove part"));
    await waitFor(() => expect(screen.queryByText("Luke 15 talk")).toBeNull());
    expect(screen.getByText("1. Essay question")).toBeTruthy();
  });

  it("a 409 needs_confirmation opens the confirm dialog with the count", async () => {
    serve({ "/api/v1/assignments/55": detail });
    patch.mockRejectedValueOnce(conflict(3)).mockResolvedValueOnce({ data: { data: { ...detail, reopened: 2 } } });
    renderWithProviders(<EditAssignmentScreen />);
    await screen.findByDisplayValue("Luke 15");
    fireEvent.press(footer().getByText("Save changes"));

    expect(await screen.findByText("This changes work 3 students have done. Save anyway?")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Save anyway"));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenLastCalledWith("/api/v1/assignments/55", { ...bodyOf(detail), confirm: true });
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith("Saved. 2 students have to submit again.");
  });

  it("refuses the form when the server says this caller cannot manage it", async () => {
    serve({ "/api/v1/assignments/55": { ...detail, canManage: false } });
    renderWithProviders(<EditAssignmentScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull();
  });
});
