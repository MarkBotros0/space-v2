import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonScreen from "../../app/(app)/season";
import SeasonsScreen from "../../app/(app)/seasons/index";

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
  absenceBudgetMinutes: 180,
  absenceWeightMinutes: 90,
  canAdminister: true,
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
    fireEvent.changeText(screen.getByLabelText("Copy code"), "s7-2027");
    fireEvent.changeText(screen.getByLabelText("Copy start date"), "2027-01-01T00:00:00.000Z");
    fireEvent.changeText(screen.getByLabelText("Copy end date"), "2027-12-31T00:00:00.000Z");
    fireEvent.press(screen.getByText("Create copy"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/duplicate", {
        year: 2027,
        code: "s7-2027",
        startDate: "2027-01-01T00:00:00.000Z",
        endDate: "2027-12-31T00:00:00.000Z",
      }),
    );
    expect(await screen.findByText("Created s7-2027.")).toBeTruthy();
  });

  it("fills the code as program and year are typed, until the code is edited by hand (REG-70)", async () => {
    renderWithProviders(<SeasonsScreen />);
    await screen.findByText("Spring 2027");
    fireEvent.changeText(screen.getByLabelText("Program"), "Spring GBV");
    fireEvent.changeText(screen.getByLabelText("Year"), "2028");
    expect(screen.getByLabelText("Code").props.value).toBe("spring-gbv-2028");
    fireEvent.changeText(screen.getByLabelText("Year"), "2029");
    expect(screen.getByLabelText("Code").props.value).toBe("spring-gbv-2029");
    fireEvent.changeText(screen.getByLabelText("Code"), "mine");
    fireEvent.changeText(screen.getByLabelText("Year"), "2030");
    expect(screen.getByLabelText("Code").props.value).toBe("mine");
  });

  it("opens the duplicate form on next year with dates shifted one year and the code to match (REG-70)", async () => {
    post.mockResolvedValue({ data: { data: { id: 99, code: "test-2027" } } });
    renderWithProviders(<SeasonsScreen />);
    fireEvent.press((await screen.findAllByText("Duplicate"))[1]); // the 2026 row
    expect(screen.getByLabelText("Copy year").props.value).toBe("2027");
    expect(screen.getByLabelText("Copy start date").props.value).toBe("2027-01-01T00:00:00.000Z");
    expect(screen.getByLabelText("Copy end date").props.value).toBe("2027-12-31T00:00:00.000Z");
    expect(screen.getByLabelText("Copy code").props.value).toBe("test-2027");
    fireEvent.changeText(screen.getByLabelText("Copy year"), "2028");
    expect(screen.getByLabelText("Copy code").props.value).toBe("test-2028");
    fireEvent.press(screen.getByText("Create copy"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/duplicate", {
        year: 2028,
        code: "test-2028",
        startDate: "2027-01-01T00:00:00.000Z",
        endDate: "2027-12-31T00:00:00.000Z",
      }),
    );
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
  it("takes an ADMIN with exactly one season straight into it (REG-72)", async () => {
    useSessionStore.setState(adminSession);
    get.mockResolvedValue({ data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026")] } } });
    renderWithProviders(<SeasonScreen />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "s7" } }),
    );
  });

  it("renders an ADMIN's current season with counts, groups and the edit section", async () => {
    useSessionStore.setState(adminSession);
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons"
        ? Promise.resolve({ data: { data: { seasons: [
            seasonRow(7, 2026, "ACTIVE", "Spring 2026"),
            seasonRow(6, 2025, "ARCHIVED", "Spring 2025"),
          ] } } })
        : Promise.resolve({ data: { data: detail } }),
    );
    patch.mockResolvedValue({ data: { data: { id: 7, code: "s7" } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("Spring 2026")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
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
});

describe("SeasonsScreen — navigation and program filter (Plan 6, G20)", () => {
  beforeEach(() => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({
      data: { data: { seasons: [
        seasonRow(8, 2027, "DRAFT", "Spring 2027"),
        { ...seasonRow(9, 2027, "ACTIVE", "GBV 2027"), program: "GBV" },
      ] } },
    });
  });

  it("opens a season by code", async () => {
    renderWithProviders(<SeasonsScreen />);
    fireEvent.press(await screen.findByText("Spring 2027"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "s8" } });
  });

  it("filters by program with exact matching (v1 R44), client-side (D-16.5)", async () => {
    renderWithProviders(<SeasonsScreen />);
    await screen.findByText("Spring 2027");
    fireEvent.press(screen.getByText("GBV"));
    expect(screen.queryByText("Spring 2027")).toBeNull();
    expect(screen.getByText("GBV 2027")).toBeTruthy();
    fireEvent.press(screen.getByText("All programs"));
    expect(screen.getByText("Spring 2027")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
