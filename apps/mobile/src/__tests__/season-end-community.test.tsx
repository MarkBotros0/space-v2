import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "gbv-2026" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), dismissAll: jest.fn(), replace: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { check, detail } from "./helpers/season-end-fixtures";
import { makeSession } from "./helpers/session";
import EndSeasonScreen from "../../app/(app)/seasons/[code]/end";
import SeasonResultsScreen from "../../app/(app)/seasons/[code]/results";

const get = apiClient.get as jest.Mock;
function serve(routes: Record<string, unknown>) {
  get.mockImplementation((url: string) =>
    url in routes
      ? Promise.resolve({ data: { data: routes[url] } })
      : Promise.reject(new Error(`not served: ${url}`)),
  );
}
const BY_CODE = "/api/v1/seasons/by-code/gbv-2026";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("SUPER"));
});

describe("End of a community-wide season", () => {
  it("shows an alumnus's class on the review and counts people in the confirm", async () => {
    const body = check({}, 2);
    body.students[0] = { ...body.students[0]!, graduationYear: 2025 };
    serve({ [BY_CODE]: detail({ isCommunityWide: true }), "/api/v1/seasons/7/end-check": body });
    renderStacked(<EndSeasonScreen />);
    await screen.findByText("Student 1");
    expect(screen.getByText("School of 2025")).toBeTruthy();
    expect(screen.queryByText(/Passing makes them/)).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "End season" }));
    expect(await screen.findByText(/This ends the season for 2 people\.$/)).toBeTruthy();
    expect(screen.queryByText(/will graduate/)).toBeNull();
  });

  it("the result sheet shows no graduation note", async () => {
    serve({
      [BY_CODE]: detail({ status: "COMPLETED", isCommunityWide: true, graduatesOnPass: false }),
      "/api/v1/seasons/7/results": {
        results: [{ userId: 1, name: "Old Hand", isAlumnus: true, groupName: null, attendancePct: 80, result: "PASSED", reason: null }],
      },
    });
    renderStacked(<SeasonResultsScreen />);
    fireEvent.press(await screen.findByText("Old Hand"));
    fireEvent.press(screen.getByRole("tab", { name: "Did not pass" }));
    expect(screen.queryByText(/alumni status/)).toBeNull();
    expect(screen.queryByText(/School of/)).toBeNull();
  });
});
