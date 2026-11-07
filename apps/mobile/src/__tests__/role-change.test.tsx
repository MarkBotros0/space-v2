import { act, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { navFor } from "@space/shared";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { routeNameForHref } from "../../app/(app)/(tabs)/_layout";
import { PillTabBar } from "../design/layout/floating-tab-bar";
import { useCurrentSeasonId } from "../hooks/use-seasons";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeScopes, makeUser } from "./helpers/session";

const get = apiClient.get as jest.Mock;

/** What the shell does: the pill from the session's nav, and a role-keyed query beside it. */
function Shell() {
  const nav = useSessionStore((s) => s.nav());
  const { seasonId } = useCurrentSeasonId();
  const items = nav?.tabs ?? [];
  const state = { index: 0, routes: items.map((t) => ({ key: t.href, name: routeNameForHref(t.href) })) };
  return (
    <>
      <Text testID="season">{String(seasonId)}</Text>
      <PillTabBar
        items={items}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state={state as any}
        navigateToTab={() => {}}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        emitter={{} as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        descriptors={{} as any}
        insets={{ top: 0, left: 0, right: 0, bottom: 34 }}
      />
    </>
  );
}

const labels = () => screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel);

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.getState().clear();
  get.mockResolvedValue({
    data: {
      data: {
        seasons: [
          { id: 9, code: "s9", title: "S9", program: "T", year: 2099, status: "ACTIVE", startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z" },
        ],
      },
    },
  });
});

describe("navFor follows the derived role", () => {
  const hrefs = (a: Parameters<typeof navFor>[0]) => navFor(a).tabs.map((t) => t.href);
  it("gives a derived ADMIN with a graduation year the admin tabs, not the alumni ones", () => {
    expect(hrefs({ role: "ADMIN", graduationYear: 2020, activeSeasonId: null })).toEqual(
      hrefs({ role: "ADMIN", graduationYear: null, activeSeasonId: null }),
    );
  });
  it("gives a person whose serving ended (derived STUDENT, graduation year) the alumni tabs again", () => {
    expect(hrefs({ role: "STUDENT", graduationYear: 2020, activeSeasonId: null })).toEqual([
      "/dashboard", "/calendar", "/history", "/profile", "/more",
    ]);
  });
});

describe("a token that changes role on refresh", () => {
  it("re-renders the tabs and starts the queries the new role reads, without an error", async () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ activeSeasonId: 5, graduationYear: 2020 }));
    renderWithProviders(<Shell />);
    // Studying in a community-wide season: a student's tabs, until they serve.
    expect(labels()).toEqual(["Home", "Calendar", "To do", "Submitted", "More"]);
    expect(screen.getByTestId("season").props.children).toBe("5");
    expect(get).not.toHaveBeenCalled();

    act(() => useSessionStore.getState().setSession(makeUser("LEADER"), makeScopes({ activeSeasonId: null, graduationYear: 2020, groupLeaderIds: [3] })));

    expect(labels()).toEqual(["Home", "My group", "Calendar", "Submissions", "More"]);
    await waitFor(() => expect(screen.getByTestId("season").props.children).toBe("9"));
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");
  });

  it("takes a real alumnus (no season) who becomes a leader again to the leader's tabs and queries", async () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ activeSeasonId: null, graduationYear: 2020 }));
    renderWithProviders(<Shell />);
    expect(labels()).toEqual(["Today", "Events", "History", "Profile", "More"]);
    expect(screen.getByTestId("season").props.children).toBe("null");

    act(() => useSessionStore.getState().setSession(makeUser("LEADER"), makeScopes({ activeSeasonId: null, graduationYear: 2020, groupLeaderIds: [3] })));

    expect(labels()).toEqual(["Today", "Groups", "Calendar", "Submissions", "More"]);
    await waitFor(() => expect(screen.getByTestId("season").props.children).toBe("9"));
  });
});
