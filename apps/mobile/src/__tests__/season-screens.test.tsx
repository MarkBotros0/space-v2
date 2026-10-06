import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonScreen from "../../app/(app)/season";
import SeasonsScreen from "../../app/(app)/seasons";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const seasonRow = (id: number, year: number, status: "DRAFT" | "ACTIVE" | "ARCHIVED", title: string) => ({
  id, code: `s${id}`, title, program: "TEST", year, status,
  startDate: `${year}-01-01T00:00:00.000Z`, endDate: `${year}-12-31T00:00:00.000Z`,
});

const detail = {
  ...seasonRow(7, 2026, "ACTIVE", "Spring 2026"),
  description: "The spring season.",
  sessionCount: 3,
  studentCount: 12,
  groups: [{ id: 3, name: "Group A", studentCount: 6, leaderNames: ["Lina Leader"] }],
};

const superSession = makeSession("SUPER", {}, { id: 1 });
const adminSession = makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 });
const studentSession = makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonsScreen (SUPER)", () => {
  beforeEach(() => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({
      data: { data: { seasons: [
        seasonRow(8, 2027, "DRAFT", "Spring 2027"),
        seasonRow(7, 2026, "ACTIVE", "Spring 2026"),
      ] } },
    });
  });

  it("lists seasons grouped by year with status badges", async () => {
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("Spring 2027")).toBeTruthy();
    expect(screen.getByText("2027")).toBeTruthy();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(screen.getByText("s8 · DRAFT")).toBeTruthy();
    expect(screen.getByText("s7 · ACTIVE")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");
  });

  it("duplicates a season through the inline form and parses the response", async () => {
    post.mockResolvedValue({ data: { data: { id: 99, code: "s7-2027" } } });
    renderWithProviders(<SeasonsScreen />);

    fireEvent.press((await screen.findAllByText("Duplicate"))[1]); // the 2026 row
    fireEvent.changeText(screen.getByLabelText("Copy year"), "2027");
    fireEvent.changeText(screen.getByLabelText("Copy start date"), "2027-01-01T00:00:00.000Z");
    fireEvent.changeText(screen.getByLabelText("Copy end date"), "2027-12-31T00:00:00.000Z");
    fireEvent.press(screen.getByText("Create copy"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/duplicate", {
        year: 2027,
        startDate: "2027-01-01T00:00:00.000Z",
        endDate: "2027-12-31T00:00:00.000Z",
      }),
    );
    expect(await screen.findByText("Created s7-2027.")).toBeTruthy();
  });

  it("creates a DRAFT season and shows a 409's server message verbatim", async () => {
    post.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "code_taken", message: "A season with that code already exists." } } },
      }),
    );
    renderWithProviders(<SeasonsScreen />);

    await screen.findByText("Spring 2027");
    fireEvent.changeText(screen.getByLabelText("Code"), "spring-2028");
    fireEvent.changeText(screen.getByLabelText("Program"), "TEST");
    fireEvent.changeText(screen.getByLabelText("Year"), "2028");
    fireEvent.changeText(screen.getByLabelText("Start date"), "2028-01-01T00:00:00.000Z");
    fireEvent.changeText(screen.getByLabelText("End date"), "2028-12-31T00:00:00.000Z");
    fireEvent.press(screen.getByText("Create season"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons", {
        code: "spring-2028",
        program: "TEST",
        year: 2028,
        startDate: "2028-01-01T00:00:00.000Z",
        endDate: "2028-12-31T00:00:00.000Z",
        status: "DRAFT",
      }),
    );
    expect(await screen.findByText("A season with that code already exists.")).toBeTruthy();
  });

  it("deletes only on a second, confirming press", async () => {
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    renderWithProviders(<SeasonsScreen />);

    fireEvent.press((await screen.findAllByText("Delete"))[0]);
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Really delete?"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/8"));
  });
});

describe("SeasonsScreen (non-SUPER)", () => {
  it("shows ADMIN the list without write actions", async () => {
    useSessionStore.setState(adminSession);
    get.mockResolvedValue({ data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026")] } } });
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("Spring 2026")).toBeTruthy();
    expect(screen.queryByText("Duplicate")).toBeNull();
    expect(screen.queryByText("Create season")).toBeNull();
  });

  it("gives a STUDENT the role empty state and fetches nothing", async () => {
    useSessionStore.setState(studentSession);
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("SeasonScreen (workspace)", () => {
  it("renders an ADMIN's current season with counts, groups and the edit section", async () => {
    useSessionStore.setState(adminSession);
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons"
        ? Promise.resolve({ data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026")] } } })
        : Promise.resolve({ data: { data: detail } }),
    );
    patch.mockResolvedValue({ data: { data: { id: 7, code: "s7" } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("Spring 2026")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7");
    expect(screen.getByText("3 sessions · 12 students")).toBeTruthy();
    expect(screen.getByText("Group A")).toBeTruthy();
    expect(screen.getByText("6 students · Lina Leader")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Description"), "Updated.");
    fireEvent.changeText(screen.getByLabelText("Absence budget (minutes)"), "240");
    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7", {
        description: "Updated.",
        absenceBudgetMinutes: 240,
      }),
    );
  });

  it("renders for a STUDENT from the pinned season, read-only, without the seasons list (G21)", async () => {
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({ data: { data: detail } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("Spring 2026")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7");
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
    expect(screen.queryByText("Save changes")).toBeNull();
  });

  it("shows a student with no season an empty state, not a spinner", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { id: 9 }));
    renderWithProviders(<SeasonScreen />);
    expect(await screen.findByText("No season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
