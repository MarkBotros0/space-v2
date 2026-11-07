import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
let mockParams: Record<string, string> = { code: "s7" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, dismissTo: mockDismissTo, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { detail, routeGets } from "./helpers/season-detail-fixtures";
import { makeSession } from "./helpers/session";
import SeasonEditScreen from "../../app/(app)/seasons/[code]/edit";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const del = apiClient.delete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { code: "s7" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonEditScreen (/seasons/[code]/edit) — SUPER only", () => {
  it("saves identity AND status through the full-body PATCH, keeping the stored budgets, and follows a code change", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    // A finished season is the one whose status the form can still move (COMPLETED to ARCHIVED):
    // a draft starts through Start, and Draft is its only choice here.
    routeGets(detail({ status: "COMPLETED" }));
    patch.mockResolvedValue({ data: { data: { id: 7, code: "gbv-2099" } } });
    renderWithProviders(<SeasonEditScreen />);

    fireEvent.press(await screen.findByLabelText("Change code"));
    fireEvent.changeText(screen.getByLabelText("Code"), "GBV 2099");
    fireEvent.press(await screen.findByText("Archived"));
    fireEvent.press(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/seasons/7", {
        code: "GBV 2099",
        program: "TEST",
        year: 2099,
        description: "Spring.",
        startDate: "2099-01-01T00:00:00.000Z",
        endDate: "2099-12-31T00:00:00.000Z",
        status: "ARCHIVED",
        absenceBudgetMinutes: 240,
        absenceWeightMinutes: 90,
      }),
    );
    expect(mockDismissTo).toHaveBeenCalledWith({
      pathname: "/seasons/[code]",
      params: { code: "gbv-2099" },
    });
  });

  it("previews the slug and blocks an invalid code client-side with the server's own schema", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    renderWithProviders(<SeasonEditScreen />);
    fireEvent.press(await screen.findByLabelText("Change code"));
    fireEvent.changeText(screen.getByLabelText("Code"), "x");
    fireEvent.press(screen.getByText("Save changes"));
    expect(screen.getByLabelText("Code").props.accessibilityHint).toMatch(/2–40/);
    expect(patch).not.toHaveBeenCalled();
  });

  it("deletes behind v1's confirm dialog and explains season_in_use", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    routeGets(detail());
    del.mockRejectedValueOnce(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: {
              code: "season_in_use",
              message: "This season has sessions or enrollments; archive it instead.",
            },
          },
        },
      }),
    );
    renderWithProviders(<SeasonEditScreen />);
    fireEvent.press(await screen.findByText("Delete season"));
    expect(await screen.findByText('Delete "TEST 2099"?')).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Delete"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/seasons/7"));
    expect(await screen.findByText(/can't be deleted\. Archive it once it has finished/)).toBeTruthy();

    del.mockResolvedValueOnce({ data: { data: { deleted: true } } });
    fireEvent.press(screen.getByText("Delete season"));
    fireEvent.press(await screen.findByText("Delete"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/seasons"));
  });

  it("refuses a non-SUPER without fetching", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<SeasonEditScreen />);
    expect(
      await screen.findByText("Only a super admin can edit a season's identity."),
    ).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
