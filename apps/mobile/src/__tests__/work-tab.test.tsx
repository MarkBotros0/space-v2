import { screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { isBlockedForAlumni } from "../lib/alumni-guard";
import { useSessionStore } from "../store/session";
import { get, requested } from "./helpers/dashboard-fixtures";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import WorkTab from "../../app/(app)/(tabs)/work";

const NOT_FOR_ROLE = "This screen isn't available for your role.";

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => Promise.reject(new Error(`not served: ${url}`)));
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("/work", () => {
  it.each(["ADMIN", "LEADER", "MENTOR", "SUPER"] as const)(
    "%s: says it isn't for their role and sends no student reads",
    async (role) => {
      useSessionStore.setState(makeSession(role, { activeSeasonId: 7 }));
      renderWithProviders(<WorkTab />);
      expect(await screen.findByText(NOT_FOR_ROLE)).toBeTruthy();
      expect(requested()).toEqual([]);
    },
  );

  it("a student gets the Work screen", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));
    renderWithProviders(<WorkTab />);
    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(screen.queryByText(NOT_FOR_ROLE)).toBeNull();
  });

  it("an alumnus stays as they were: blocked by the layout's guard, not told about roles", () => {
    expect(isBlockedForAlumni(["(app)", "(tabs)", "work"])).toBe(true);
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null, graduationYear: 2020 }));
    renderWithProviders(<WorkTab />);
    expect(screen.queryByText(NOT_FOR_ROLE)).toBeNull();
  });
});
