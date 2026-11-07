import { screen, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
beforeEach(() => {
  mockParams = {};
});
jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
    useLocalSearchParams: () => mockParams,
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
  };
});

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";

import AssignmentsScreen from "../../app/(app)/assignments";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockRejectedValue(new Error("not served"));
});

// The student's list itself is pinned in work-screen.test.tsx, the staff's in
// assignments-staff-screen.test.tsx.
describe("/assignments on the stack", () => {
  it("a student gets My work in place, with the Back bar: no replace, no redirect (P2-11)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));
    renderStacked(<AssignmentsScreen />);
    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(screen.getByText("My work")).toBeTruthy();
    expect(screen.getByText("What to do, and what you handed in")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText(/^redirect:/)).toBeNull();
  });

  it("an admin keeps the staff screen", async () => {
    useSessionStore.setState(makeSession("ADMIN"));
    renderStacked(<AssignmentsScreen />);
    // The kit's title row, whose action drops below rather than breaking the word.
    await screen.findByTestId("large-title-text");
    expect(within(screen.getByTestId("large-title-text")).getByText("Assignments")).toBeTruthy();
    expect(screen.queryByText("Your current season")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
