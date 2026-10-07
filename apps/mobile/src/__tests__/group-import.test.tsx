// apps/mobile/src/__tests__/group-import.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ code: "s-7" }),
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import GroupImportScreen from "../../app/(app)/seasons/[code]/roster/import";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const season = {
  id: 7,
  code: "s-7",
  title: "Spring 2099",
  program: "GBV",
  year: 2099,
  status: "ACTIVE",
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-06-30T00:00:00.000Z",
};
const scopesFor = (seasonAdminIds: number[]) => ({
  seasonAdminIds,
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
});
const adminOf7 = {
  user: { id: 2, name: "Admin", email: "adm@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
  scopes: scopesFor([7]),
};
const adminOfOther = { ...adminOf7, scopes: scopesFor([8]) };

const preview = {
  rows: [
    { rowNumber: 2, name: "Ann", email: "ann@jpc.test", group: "Group A", status: "assign", message: null, studentUserId: 11, groupId: 3 },
    { rowNumber: 3, name: "Bob", email: "bob@jpc.test", group: "Group A", status: "unchanged", message: null, studentUserId: 12, groupId: 3 },
    { rowNumber: 4, name: "Cy", email: "cy@jpc.test", group: "Nope", status: "no_group", message: "No group named \"Nope\".", studentUserId: 13, groupId: null },
  ],
  delimiter: "tab",
  counts: { assign: 1, unchanged: 1, no_student: 0, no_group: 1, invalid: 0, total: 3 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockResolvedValue({ data: { data: { seasons: [season] } } });
});

describe("GroupImportScreen", () => {
  it("refuses an ADMIN of another season without calling the import API", async () => {
    useSessionStore.setState(adminOfOther);
    renderWithProviders(<GroupImportScreen />);
    expect(await screen.findByText(/isn't available for this season/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("previews against the season resolved from the route's code", async () => {
    useSessionStore.setState(adminOf7);
    post.mockResolvedValue({ data: { data: preview } });
    renderWithProviders(<GroupImportScreen />);

    expect(await screen.findByText("Import groups · Spring 2099")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Paste your spreadsheet"), "email\tgroup\nann@jpc.test\tGroup A");
    fireEvent.press(screen.getByText("Preview"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/seasons/7/imports/groups/preview", {
        text: "email\tgroup\nann@jpc.test\tGroup A",
        delimiter: "auto",
      }),
    );
    expect(await screen.findByText("1 to assign · 1 unchanged · 1 not matched")).toBeTruthy();
  });

  it("commits only the assign rows, as resolved id pairs, and reports what was APPLIED", async () => {
    useSessionStore.setState(adminOf7);
    post
      .mockResolvedValueOnce({ data: { data: preview } })
      .mockResolvedValueOnce({ data: { data: { assigned: 0, skipped: 1, skippedStudentIds: [11] } } });
    renderWithProviders(<GroupImportScreen />);

    fireEvent.changeText(await screen.findByLabelText("Paste your spreadsheet"), "email\tgroup\nann@jpc.test\tGroup A");
    fireEvent.press(screen.getByText("Preview"));
    fireEvent.press(await screen.findByText("Assign 1 student"));

    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith("/api/v1/seasons/7/imports/groups/commit", {
        assignments: [{ studentUserId: 11, groupId: 3 }],
      }),
    );
    // v1 reported the requested count (spec R80); the screen reports the
    // server's applied count and names the skipped row.
    expect(await screen.findByText("0 assigned · 1 skipped")).toBeTruthy();
    expect(screen.getByText(/Row 2 · ann@jpc.test/)).toBeTruthy();
  });
});
