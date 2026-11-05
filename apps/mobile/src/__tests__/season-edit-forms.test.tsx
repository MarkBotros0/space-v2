import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
    push: jest.fn(),
    dismissTo: mockDismissTo,
    dismissAll: jest.fn(),
  }),
  useLocalSearchParams: () => ({ code: "gbv-2026" }),
}));

import type { SeasonDetail } from "@space/shared";

import { EditSeason, parseMinutes } from "../components/season/EditSeason";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SeasonEditScreen from "../../app/(app)/seasons/[code]/edit";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

const season: SeasonDetail = {
  id: 7,
  code: "gbv-2026",
  title: "GBV 2026",
  program: "GBV",
  year: 2026,
  status: "ACTIVE",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-12-31T00:00:00.000Z",
  description: "A season",
  sessionCount: 3,
  studentCount: 10,
  absenceBudgetMinutes: 240,
  absenceWeightMinutes: 60,
  canAdminister: true,
  groups: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("parseMinutes", () => {
  it.each([
    ["180", 180],
    [" 90 ", 90],
    ["", null],
    ["0", null],
    ["1.5", null],
    ["-5", null],
    ["12abc", null],
  ])("%j → %j", (raw, expected) => {
    expect(parseMinutes(raw)).toBe(expected);
  });
});

describe("EditSeason (admin season settings)", () => {
  it("starts the budget fields from the season's stored values and sends them", async () => {
    patch.mockResolvedValue({ data: { data: { id: 7, code: "gbv-2026" } } });
    renderWithProviders(<EditSeason season={season} />);

    expect(screen.getByLabelText("Absence budget (minutes)").props.value).toBe("240");
    expect(screen.getByLabelText("Absence weight (minutes)").props.value).toBe("60");

    fireEvent.press(screen.getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7", {
        description: "A season",
        absenceBudgetMinutes: 240,
        absenceWeightMinutes: 60,
      }),
    );
  });

  it("refuses a non-numeric or zero budget on the device", async () => {
    renderWithProviders(<EditSeason season={season} />);
    fireEvent.changeText(screen.getByLabelText("Absence budget (minutes)"), "abc");
    fireEvent.press(screen.getByText("Save changes"));
    expect(await screen.findByText(/must be whole numbers of minutes/)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Absence budget (minutes)"), "0");
    fireEvent.press(screen.getByText("Save changes"));
    expect(await screen.findByText(/must be whole numbers of minutes/)).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("SeasonEditScreen save", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("SUPER", {}, { id: 1 }));
    get.mockResolvedValue({ data: { data: season } });
  });

  it("saves the full body from the fixed save bar and dismisses to the (possibly new) code", async () => {
    patch.mockResolvedValue({ data: { data: { id: 7, code: "gbv-2027" } } });
    renderWithProviders(<SeasonEditScreen />);
    fireEvent.changeText(await screen.findByLabelText("Code"), "gbv-2027");
    fireEvent.press(within(screen.getByTestId("save-bar")).getByText("Save changes"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7", {
        code: "gbv-2027",
        program: "GBV",
        year: 2026,
        description: "A season",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
        status: "ACTIVE",
        absenceBudgetMinutes: 240,
        absenceWeightMinutes: 60,
      }),
    );
    expect(mockDismissTo).toHaveBeenCalledWith({
      pathname: "/seasons/[code]",
      params: { code: "gbv-2027" },
    });
  });

  it("shows the server's field error from a failed save", async () => {
    patch.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "code_taken", message: "Code taken." } } },
      }),
    );
    renderWithProviders(<SeasonEditScreen />);
    await screen.findByLabelText("Code");
    fireEvent.press(within(screen.getByTestId("save-bar")).getByText("Save changes"));
    expect(await screen.findByText("Code taken.")).toBeTruthy();
  });
});

describe("SeasonEditScreen delete", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("SUPER", {}, { id: 1 }));
    get.mockResolvedValue({ data: { data: season } });
  });

  it("promises only what the server does: an empty season can be deleted", async () => {
    renderWithProviders(<SeasonEditScreen />);
    fireEvent.press(await screen.findByText("Delete season"));
    expect(await screen.findByText(/Only an empty season can be deleted/)).toBeTruthy();
    expect(screen.queryByText(/are preserved/)).toBeNull();
  });

  it("explains season_in_use clearly instead of a generic failure", async () => {
    del.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { error: { code: "season_in_use", message: "This season has sessions or enrollments; archive it instead." } },
        },
      }),
    );
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    renderWithProviders(<SeasonEditScreen />);
    fireEvent.press(await screen.findByText("Delete season"));
    fireEvent.press(await screen.findByText("Delete"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Season in use", expect.stringMatching(/Archive it instead/)),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
