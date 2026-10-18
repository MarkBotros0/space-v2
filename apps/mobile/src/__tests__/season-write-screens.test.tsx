import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { format } from "date-fns";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import NewSeasonScreen from "../../app/(app)/seasons/new";

const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

/** The picker opens on the current month, so today is always on screen. */
function pickToday(label: string) {
  fireEvent.press(screen.getByLabelText(label));
  fireEvent.press(screen.getByLabelText(format(new Date(), "PPP")));
  return format(new Date(), "yyyy-MM-dd");
}

describe("NewSeasonScreen (/seasons/new)", () => {
  it("fills the code as program and year are typed, until the code is edited by hand (REG-70)", () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<NewSeasonScreen />);
    fireEvent.changeText(screen.getByLabelText("Program"), "Spring GBV");
    fireEvent.changeText(screen.getByLabelText("Year"), "2028");
    expect(screen.getByLabelText("Code").props.value).toBe("spring-gbv-2028");
    fireEvent.changeText(screen.getByLabelText("Year"), "2029");
    expect(screen.getByLabelText("Code").props.value).toBe("spring-gbv-2029");
    fireEvent.changeText(screen.getByLabelText("Code"), "mine");
    fireEvent.changeText(screen.getByLabelText("Year"), "2030");
    expect(screen.getByLabelText("Code").props.value).toBe("mine");
  });

  it("creates the season with v1's defaults and opens it", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockResolvedValue({ data: { data: { id: 99, code: "gbv-2028" } } });
    renderWithProviders(<NewSeasonScreen />);

    fireEvent.changeText(screen.getByLabelText("Program"), "GBV");
    fireEvent.changeText(screen.getByLabelText("Year"), "2028");
    const day = pickToday("Start date");
    pickToday("End date");
    fireEvent.press(screen.getByText("Create season"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons", {
        code: "gbv-2028",
        program: "GBV",
        year: 2028,
        description: null,
        startDate: `${day}T00:00:00.000Z`,
        endDate: `${day}T00:00:00.000Z`,
        status: "DRAFT",
        absenceBudgetMinutes: 180,
        absenceWeightMinutes: 90,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/seasons/[code]",
      params: { code: "gbv-2028" },
    });
  });

  it("shows a 409's server message verbatim", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    post.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: { code: "code_taken", message: "A season with that code already exists." },
          },
        },
      }),
    );
    renderWithProviders(<NewSeasonScreen />);
    fireEvent.changeText(screen.getByLabelText("Program"), "GBV");
    fireEvent.changeText(screen.getByLabelText("Year"), "2028");
    pickToday("Start date");
    pickToday("End date");
    fireEvent.press(screen.getByText("Create season"));
    expect(await screen.findByText("A season with that code already exists.")).toBeTruthy();
  });

  it("validates with the server's schema before posting", () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<NewSeasonScreen />);
    fireEvent.press(screen.getByText("Create season"));
    expect(screen.getByLabelText("Program").props.accessibilityHint).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("cancels back", () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<NewSeasonScreen />);
    fireEvent.press(screen.getByText("Cancel"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("is SUPER-only", () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<NewSeasonScreen />);
    expect(screen.getByText("Only a super admin can create a season.")).toBeTruthy();
  });
});
