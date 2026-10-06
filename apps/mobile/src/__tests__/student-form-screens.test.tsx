import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import NewStudentScreen from "../../app/(app)/students/new";
import EditStudentScreen from "../../app/(app)/student/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const season = (id: number, title: string, status: "ACTIVE" | "DRAFT" | "ARCHIVED") => ({
  id, code: `s${id}`, title, program: "TEST", year: 2099, status,
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
});

const enrollment = (seasonId: number, title: string) => ({
  enrollmentId: 500 + seasonId, seasonId, seasonCode: `S${seasonId}`, seasonTitle: title,
  seasonStatus: "ACTIVE" as const, startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
  groupName: null, status: "ACTIVE" as const, enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null, droppedAt: null, dropReason: null,
});

const detail = {
  id: 21, name: "Sara Student", email: "sara@jpc.test", avatarPath: null, graduationYear: null,
  currentGroup: null, enrollments: [enrollment(7, "Spring 2099"), enrollment(8, "Autumn 2099")],
  profile: {
    university: "Cairo University", year: null, gifts: null,
    activeSeasonId: 7, activeSeasonTitle: "Spring 2099", activeSeasonCode: "S7",
    phone: null, dateOfBirth: null, spiritualBackground: null, notes: "Watch attendance",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("/students/new", () => {
  beforeEach(() => {
    get.mockResolvedValue({
      data: { data: { seasons: [season(7, "Spring 2099", "ACTIVE"), season(9, "Old 2001", "ARCHIVED")] } },
    });
  });

  it("creates with an optional enrollment and no password anywhere — then opens the new student (D1, D7)", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { id: 77, email: "new@jpc.test" } } });
    renderWithProviders(<NewStudentScreen />);

    fireEvent.changeText(screen.getByLabelText("Full name"), "New Student");
    fireEvent.changeText(screen.getByLabelText("Email"), "new@jpc.test");
    fireEvent.changeText(screen.getByLabelText("Date of birth (YYYY-MM-DD)"), "2004-03-09");
    fireEvent.press(await screen.findByText("Spring 2099"));
    // Archived seasons are not offered for a new enrollment.
    expect(screen.queryByText("Old 2001")).toBeNull();
    fireEvent.press(screen.getByText("Create and send invite"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/api/v1/students");
    expect(body).toMatchObject({
      name: "New Student",
      email: "new@jpc.test",
      dateOfBirth: "2004-03-09T00:00:00.000Z",
      seasonId: 7,
    });
    expect(body).not.toHaveProperty("password");
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "77" } }),
    );
  });

  it("validates locally before posting", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<NewStudentScreen />);

    fireEvent.changeText(screen.getByLabelText("Full name"), "N");
    fireEvent.changeText(screen.getByLabelText("Email"), "nope");
    fireEvent.press(screen.getByText("Create and send invite"));

    await waitFor(() =>
      expect(screen.getByLabelText("Full name").props.accessibilityHint).toBe("At least 2 characters."),
    );
    expect(screen.getByLabelText("Email").props.accessibilityHint).toBe("Must be a valid email.");
    expect(post).not.toHaveBeenCalled();
  });

  it("is SUPER-only, like the endpoint (Plan 7) — an ADMIN fires no request", () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<NewStudentScreen />);
    expect(screen.getByText(/Only SUPER accounts can create students/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("/student/[id]/edit", () => {
  beforeEach(() => {
    get.mockResolvedValue({ data: { data: detail } });
    patch.mockResolvedValue({ data: { data: { id: 21 } } });
  });

  it("SUPER edits fields and moves the pointer among ACTIVE enrollments only", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<EditStudentScreen />);

    const university = await screen.findByLabelText("University");
    expect(university.props.value).toBe("Cairo University");
    fireEvent.changeText(screen.getByLabelText("Phone"), "+20 111");
    fireEvent.press(screen.getByText("Autumn 2099"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [url, body] = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/api/v1/students/21");
    expect(body).toMatchObject({ phone: "+20 111", notes: "Watch attendance", activeSeasonId: 8 });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("ADMIN edits notes but never sends activeSeasonId (Plan 7's ADMIN allowlist)", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<EditStudentScreen />);

    await screen.findByLabelText("University");
    expect(screen.queryByText("Active season")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Internal notes"), "Updated by admin");
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const body = patch.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.notes).toBe("Updated by admin");
    expect(body).not.toHaveProperty("activeSeasonId");
  });

  it("an ADMIN without an ACTIVE enrollment in their seasons gets an explanation, not a form", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [99] }));
    renderWithProviders(<EditStudentScreen />);
    expect(await screen.findByText(/active enrollment in a season you run/)).toBeTruthy();
  });
});
