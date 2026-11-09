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
import SeasonsScreen from "../../app/(app)/(tabs)/seasons/index";

const get = apiClient.get as jest.Mock;

const seasonRow = (id: number, year: number, status: "DRAFT" | "ACTIVE" | "ARCHIVED", title: string) => ({
  id,
  code: `s${id}`,
  title,
  program: "TEST",
  year,
  status,
  startDate: `${year}-01-01T00:00:00.000Z`,
  endDate: `${year}-12-31T00:00:00.000Z`,
});

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
      data: {
        data: {
          seasons: [seasonRow(8, 2027, "DRAFT", "Spring 2027"), seasonRow(7, 2026, "ACTIVE", "Spring 2026")],
        },
      },
    });
  });

  it("lists seasons by program with status badges, v1's /super/seasons", async () => {
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("Spring 2027")).toBeTruthy();
    expect(screen.getByText("TEST")).toBeTruthy();
    // Once in the status filter, and once per season with that status.
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(1);
    expect(screen.queryByText("Create and manage program seasons.")).toBeNull();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");
  });

  it("shows a row's code and dates with no trailing separator, with no program chips", async () => {
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("s8 · Jan 1, 2027 – Dec 31, 2027")).toBeTruthy();
    expect(screen.queryByText("All programs")).toBeNull();
    expect(screen.queryByText(/·\s*$/)).toBeNull();
  });

  it("sends New season to its own page; rows carry no pencil (Edit season lives on the detail)", async () => {
    renderWithProviders(<SeasonsScreen />);
    await screen.findByText("Spring 2026");
    fireEvent.press(screen.getByText("New season"));
    expect(mockPush).toHaveBeenCalledWith("/seasons/new");
    expect(screen.queryByLabelText("Edit Spring 2026")).toBeNull();
  });

  it("keeps New season in the empty state for super", async () => {
    get.mockResolvedValue({ data: { data: { seasons: [] } } });
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("No seasons yet")).toBeTruthy();
    expect(screen.getAllByText("New season").length).toBeGreaterThan(0);
  });
});

describe("SeasonsScreen (non-SUPER)", () => {
  it("shows ADMIN the list without write actions", async () => {
    useSessionStore.setState(adminSession);
    get.mockResolvedValue({
      data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026")] } },
    });
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("Spring 2026")).toBeTruthy();
    expect(screen.queryByText("New season")).toBeNull();
    expect(screen.queryByLabelText("Edit Spring 2026")).toBeNull();
  });

  it("leaves the empty state without New season for ADMIN", async () => {
    useSessionStore.setState(adminSession);
    get.mockResolvedValue({ data: { data: { seasons: [] } } });
    renderWithProviders(<SeasonsScreen />);
    expect(await screen.findByText("No seasons yet")).toBeTruthy();
    expect(screen.queryByText(/Create your first season/)).toBeNull();
    expect(screen.queryByText("New season")).toBeNull();
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
    get.mockResolvedValue({
      data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026")] } },
    });
    renderWithProviders(<SeasonScreen />);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/seasons/[code]",
        params: { code: "s7" },
      }),
    );
  });

  it("lists an ADMIN's several seasons by program, v1's My Season page", async () => {
    useSessionStore.setState(adminSession);
    get.mockResolvedValue({
      data: {
        data: {
          seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026"), seasonRow(6, 2025, "ARCHIVED", "Spring 2025")],
        },
      },
    });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("TEST")).toBeTruthy();
    expect(screen.getByText("My Season")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("s7 · Jan 1, 2026 – Dec 31, 2026")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Spring 2025"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "s6" } });
  });

  it("tells an ADMIN with no season to contact a super-admin", async () => {
    useSessionStore.setState(adminSession);
    get.mockResolvedValue({ data: { data: { seasons: [] } } });
    renderWithProviders(<SeasonScreen />);
    expect(
      await screen.findByText("You aren't assigned to a season yet. Contact a super-admin to be added."),
    ).toBeTruthy();
  });
});

describe("SeasonScreen (staff, My Season)", () => {
  it("wraps a long description in full instead of truncating it to one line", async () => {
    useSessionStore.setState(superSession);
    const long = "A long description of the season. ".repeat(12).trim();
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/seasons")
        return Promise.resolve({
          data: { data: { seasons: [seasonRow(7, 2026, "ACTIVE", "Spring 2026")] } },
        });
      if (url === "/api/v1/seasons/7")
        return Promise.resolve({
          data: {
            data: {
              ...seasonRow(7, 2026, "ACTIVE", "Spring 2026"),
              description: long,
              sessionCount: 2,
              studentCount: 4,
              absenceBudgetMinutes: 240,
              absenceWeightMinutes: 90,
              canAdminister: true,
              groups: [],
            },
          },
        });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderWithProviders(<SeasonScreen />);
    const text = await screen.findByText(long);
    expect(text.props.numberOfLines).toBeUndefined();
  });
});

describe("SeasonsScreen — navigation and program filter (Plan 6, G20)", () => {
  beforeEach(() => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({
      data: {
        data: {
          seasons: [
            seasonRow(8, 2027, "DRAFT", "Spring 2027"),
            { ...seasonRow(9, 2027, "ACTIVE", "GBV 2027"), program: "GBV" },
          ],
        },
      },
    });
  });

  it("opens a season by code", async () => {
    renderWithProviders(<SeasonsScreen />);
    fireEvent.press(await screen.findByText("Spring 2027"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "s8" } });
  });

  it("filters by status over the list already loaded, with no program chips", async () => {
    renderWithProviders(<SeasonsScreen />);
    await screen.findByText("Spring 2027");
    expect(screen.queryByText("All programs")).toBeNull();
    fireEvent.press(screen.getByText("Finished"));
    expect(screen.queryByText("Spring 2027")).toBeNull();
    expect(screen.getByText("No finished seasons")).toBeTruthy();
    fireEvent.press(screen.getByText("All"));
    expect(screen.getByText("Spring 2027")).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("counts a completed and an archived season as finished, and only them", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          seasons: [
            {
              id: 1,
              code: "a",
              title: "Done one",
              program: "A",
              year: 2025,
              status: "COMPLETED",
              startDate: "2025-01-01T00:00:00.000Z",
              endDate: "2025-02-01T00:00:00.000Z",
            },
            {
              id: 2,
              code: "b",
              title: "Done two",
              program: "A",
              year: 2024,
              status: "ARCHIVED",
              startDate: "2024-01-01T00:00:00.000Z",
              endDate: "2024-02-01T00:00:00.000Z",
            },
            {
              id: 3,
              code: "c",
              title: "Running",
              program: "B",
              year: 2026,
              status: "ACTIVE",
              startDate: "2026-01-01T00:00:00.000Z",
              endDate: "2026-02-01T00:00:00.000Z",
            },
          ],
        },
      },
    });
    renderWithProviders(<SeasonsScreen />);
    await screen.findByText("Running");
    fireEvent.press(screen.getByText("Finished"));
    expect(screen.getByText("Done one")).toBeTruthy();
    expect(screen.getByText("Done two")).toBeTruthy();
    expect(screen.queryByText("Running")).toBeNull();
  });
});
