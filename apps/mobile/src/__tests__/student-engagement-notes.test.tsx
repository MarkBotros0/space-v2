import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
const superSession = {
  user: {
    id: 1, name: "Test super", email: "sup@jpc.test", role: "SUPER" as const,
    avatarPath: null, hasPassword: true,
  },
  scopes: emptyScopes,
};

// Plan 7's internal-arm detail payload, trimmed to what this screen needs.
const detail = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: { id: 3, name: "Group A" },
  enrollments: [],
  profile: {
    university: null,
    year: null,
    gifts: null,
    activeSeasonId: 7,
    activeSeasonTitle: "Spring 2099",
    activeSeasonCode: "S99",
    phone: null,
    dateOfBirth: null,
    spiritualBackground: null,
    notes: null,
  },
};

const engagement = {
  studentUserId: 21,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  atRisk: true,
  score: 75,
  attendancePct: 50,
  submissionPct: 100,
  attendanceTotal: 4,
  attendancePresent: 2,
  submissionsExpected: 2,
  submissionsCompleted: 2,
};

const note = {
  id: 5,
  body: "Checked in after the session.",
  visibility: "LEADERS" as const,
  followUpFlagged: false,
  createdAt: "2099-03-01T18:00:00.000Z",
  createdDayKey: "2099-03-02",
  updatedAt: "2099-03-01T18:00:00.000Z",
  edited: false,
  authorId: 1,
  authorName: "Test super",
  authorRole: "SUPER" as const,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  canEdit: true,
};

function mockAllEndpoints(overrides: { notes?: unknown[]; engagementStatus?: "ok" } = {}) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/students/21") return Promise.resolve({ data: { data: detail } });
    if (url === "/api/v1/students/21/engagement") {
      return Promise.resolve({ data: { data: engagement } });
    }
    if (url === "/api/v1/students/21/notes") {
      return Promise.resolve({
        data: { data: { notes: overrides.notes ?? [note], nextCursor: null } },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(superSession);
});

describe("student detail — engagement block", () => {
  it("renders the server's score and components without recomputing anything", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    // The heading renders while the query is pending, so wait on the score.
    expect(await screen.findByText("75")).toBeTruthy();
    expect(screen.getByText("Engagement")).toBeTruthy();
    expect(screen.getByText("Attendance 50%")).toBeTruthy();
    expect(screen.getByText("Submissions 100%")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21/engagement");
  });

  it("takes the at-risk flag from the contract, not from a local threshold", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    // Composite 75 with attendance at 50: a client comparing `score < 60`
    // would show nothing here. The single definition lives in packages/shared
    // and travels on the wire (rulings C4, D7).
    expect(await screen.findByText("At risk")).toBeTruthy();
  });

  it("says so plainly when the API answers no_season", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/students/21") return Promise.resolve({ data: { data: detail } });
      if (url === "/api/v1/students/21/notes") {
        return Promise.resolve({ data: { data: { notes: [], nextCursor: null } } });
      }
      // The shape axios rejects with: isAxiosError + the envelope body.
      return Promise.reject({
        isAxiosError: true,
        response: { status: 404, data: { error: { code: "no_season", message: "x" } } },
      });
    });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("No season to score yet")).toBeTruthy();
  });

  it("shows a retryable error — not 'no season' — for any other failure", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/students/21") return Promise.resolve({ data: { data: detail } });
      if (url === "/api/v1/students/21/notes") {
        return Promise.resolve({ data: { data: { notes: [], nextCursor: null } } });
      }
      return Promise.reject({
        isAxiosError: true,
        response: { status: 403, data: { error: { code: "forbidden", message: "x" } } },
      });
    });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Couldn't load engagement.")).toBeTruthy();
    expect(screen.queryByText("No season to score yet")).toBeNull();
  });
});

describe("student detail — notes", () => {
  it("fetches notes from their own gated endpoint, never from the detail payload", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Checked in after the session.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21/notes");
  });

  it("states the visibility rule the API actually enforces", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    // Exactly one match: the note card's caption. The composer's chips say
    // "Group leaders" / "Mentors" / "Season admins", so they cannot collide.
    expect(await screen.findByText("Visible to group leaders only")).toBeTruthy();
  });

  it("posts a new note with the chosen visibility and clears the field", async () => {
    mockAllEndpoints();
    post.mockResolvedValue({ data: { data: { note } } });

    renderWithProviders(<StudentDetailScreen />);

    const input = await screen.findByLabelText("New note");
    fireEvent.changeText(input, "space-v2-test new observation");
    fireEvent.press(screen.getByText("Season admins"));
    fireEvent.press(screen.getByText("Save note"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/21/notes", {
        body: "space-v2-test new observation",
        visibility: "ADMINS",
        followUpFlagged: false,
      }),
    );
  });

  it("sends the 'Flag for admin follow-up' toggle's value (v1 note-form.tsx; R12)", async () => {
    mockAllEndpoints();
    post.mockResolvedValue({ data: { data: { note } } });

    renderWithProviders(<StudentDetailScreen />);

    fireEvent.changeText(await screen.findByLabelText("New note"), "space-v2-test flagged");
    fireEvent(screen.getByLabelText("Flag for admin follow-up"), "valueChange", true);
    fireEvent.press(screen.getByText("Save note"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/21/notes", {
        body: "space-v2-test flagged",
        visibility: "LEADERS",
        followUpFlagged: true,
      }),
    );
  });

  it("dates a note with the server's org-day, not the device zone (R90)", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Test super · Mar 2, 2099")).toBeTruthy();
  });

  it("warns, in the composer, that the audience is exactly one staff group", async () => {
    mockAllEndpoints();

    renderWithProviders(<StudentDetailScreen />);

    // v1's copy said "in addition to you and admins" and was wrong (R36, D3).
    expect(
      await screen.findByText(/Only the group you choose can read this note/),
    ).toBeTruthy();
  });
});
