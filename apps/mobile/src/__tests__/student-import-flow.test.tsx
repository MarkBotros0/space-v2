// apps/mobile/src/__tests__/student-import-flow.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import ImportScreen from "../../app/(app)/users/import";

import {
  chooseSeason,
  previewBody,
  seasons,
  superSession,
  template,
} from "./helpers/student-import-fixtures";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockImplementation((url: string) =>
    url.includes("/template") ? Promise.resolve(template) : Promise.resolve(seasons),
  );
});

describe("ImportScreen — step 2, preview", () => {
  async function reachPreview(body = previewBody()) {
    useSessionStore.setState(superSession);
    post.mockResolvedValue(body);
    renderWithProviders(<ImportScreen />);
    await chooseSeason();
    fireEvent.changeText(
      screen.getByLabelText("Paste your spreadsheet"),
      "name\temail\nA\ta@jpc.test",
    );
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText(/\d+ new · /);
  }

  it("defaults the filter to the rows that need attention, not to everything", async () => {
    // A 2000-row list on a 375px screen is unusable; the operator will not
    // scroll to find row 1841 (spec §10c).
    await reachPreview();
    expect(screen.getByText("Bad Row")).toBeTruthy();
    expect(screen.queryByText("Fresh Student")).toBeNull();

    fireEvent.press(screen.getByText("All"));
    expect(await screen.findByText("Fresh Student")).toBeTruthy();
  });

  it("gives every row's status chip and message the full width, so they stack the same way", async () => {
    await reachPreview();
    fireEvent.press(screen.getByText("All"));
    await screen.findByText("Fresh Student");
    const statuses = screen.getAllByTestId("import-row-status");
    expect(statuses.length).toBeGreaterThan(1);
    for (const s of statuses) expect(s.props.className).toContain("w-full");
  });

  it("warns about a column it did not recognise (D-16.12)", async () => {
    await reachPreview();
    expect(screen.getByText(/Phone No/)).toBeTruthy();
    expect(screen.getByText(/not recognised/i)).toBeTruthy();
  });

  it("commits only the importable rows, sending values and no status (D-16.4)", async () => {
    await reachPreview();
    post.mockResolvedValue({
      data: {
        data: {
          created: 1,
          skipped: 0,
          enrolled: 0,
          rows: [
            {
              rowNumber: 2,
              name: "Fresh Student",
              email: "fresh@jpc.test",
              outcome: "created",
              message: null,
              userId: 55,
            },
          ],
        },
      },
    });

    fireEvent.press(screen.getByText("Import 1 student"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const [url, body] = post.mock.calls[1];
    expect(url).toBe("/api/v1/imports/students/commit");
    expect(body).toMatchObject({ mode: "season", seasonId: 7, onExisting: "skip" });
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toEqual({
      rowNumber: 2,
      values: expect.objectContaining({ email: "fresh@jpc.test" }),
    });
    expect("status" in body.rows[0]).toBe(false);
  });

  it("requires an explicit confirmation before sending onExisting=enroll, and then SENDS the existing rows (D-16.7)", async () => {
    const existingRow = {
      rowNumber: 4,
      name: "Returning Student",
      email: "back@jpc.test",
      status: "exists",
      message: "Already in the system.",
      values: {
        name: "Returning Student",
        email: "back@jpc.test",
        university: null,
        faculty: null,
        universityGraduationYear: null,
        phone: null,
        dateOfBirth: null,
        notes: null,
      },
    };
    const base = previewBody().data.data;
    await reachPreview({
      data: {
        data: {
          ...base,
          rows: [...base.rows, existingRow],
          counts: { ...base.counts, exists: 1, total: 3 },
        },
      },
    });
    fireEvent.press(screen.getByText("Enrol existing students"));

    // The control alone must not arm it — enrol changes existing records.
    expect(await screen.findByText(/will also enrol/i)).toBeTruthy();
    // Unconfirmed: the button still counts only the new row.
    expect(screen.getByText("Import 1 student")).toBeTruthy();
    fireEvent.press(screen.getByText("Yes, enrol them too"));

    post.mockResolvedValue({ data: { data: { created: 1, skipped: 0, enrolled: 1, rows: [] } } });
    // Confirmed: the existing row is now part of the commit — without it,
    // `enroll` reaches the server with nothing to enrol (D-16.7's whole point).
    fireEvent.press(screen.getByText("Import 1 student, enrol 1"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const body = post.mock.calls[1][1];
    expect(body.onExisting).toBe("enroll");
    expect(body.rows.map((r: { rowNumber: number }) => r.rowNumber).sort()).toEqual([2, 4]);
  });

  it("keeps the paste when the operator goes back, so a fix does not start over", async () => {
    await reachPreview();
    fireEvent.press(screen.getByText("Back to your spreadsheet"));

    const field = await screen.findByLabelText("Paste your spreadsheet");
    expect(field.props.value).toBe("name\temail\nA\ta@jpc.test");
  });

  it("surfaces the server's parse message verbatim when the paste is unreadable", async () => {
    useSessionStore.setState(superSession);
    post.mockRejectedValue({
      response: {
        data: {
          error: {
            code: "bad_request",
            message: 'There is an unclosed " in that paste. Remove or double it, then paste again.',
          },
        },
      },
    });
    renderWithProviders(<ImportScreen />);
    fireEvent.changeText(await screen.findByLabelText("Paste your spreadsheet"), 'name\nA,"oops');
    fireEvent.press(screen.getByText("Preview"));

    expect(await screen.findByText(/unclosed/)).toBeTruthy();
  });
});

describe("ImportScreen — step 3, result", () => {
  it("reports the counts and says plainly that no invites were sent (spec R55)", async () => {
    useSessionStore.setState(superSession);
    post.mockResolvedValueOnce(previewBody()).mockResolvedValueOnce({
      data: {
        data: {
          created: 1,
          skipped: 1,
          enrolled: 0,
          rows: [
            {
              rowNumber: 2,
              name: "Fresh Student",
              email: "fresh@jpc.test",
              outcome: "created",
              message: null,
              userId: 55,
            },
            {
              rowNumber: 4,
              name: "Old Student",
              email: "old@jpc.test",
              outcome: "skipped",
              message: "Already in the system.",
              userId: 12,
            },
          ],
        },
      },
    });

    renderWithProviders(<ImportScreen />);
    await chooseSeason();
    fireEvent.changeText(
      screen.getByLabelText("Paste your spreadsheet"),
      "name\temail\nA\ta@jpc.test",
    );
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText(/1 new · /);
    fireEvent.press(screen.getByText("Import 1 student"));

    expect(await screen.findByText(/1 created/)).toBeTruthy();
    expect(screen.getByText(/no invites were sent/i)).toBeTruthy();
    // The non-created rows are listed by ROW NUMBER — a report you cannot map
    // back to the sheet is not a report (spec §8).
    expect(screen.getByText(/Row 4/)).toBeTruthy();
    expect(screen.getByText(/Already in the system/)).toBeTruthy();
  });

  it("says re-running the same paste is safe", async () => {
    // Idempotence is worthless to an operator who does not know about it —
    // the exact gap spec D13 names.
    useSessionStore.setState(superSession);
    post
      .mockResolvedValueOnce(previewBody())
      .mockResolvedValueOnce({ data: { data: { created: 1, skipped: 0, enrolled: 0, rows: [] } } });

    renderWithProviders(<ImportScreen />);
    await chooseSeason();
    fireEvent.changeText(
      screen.getByLabelText("Paste your spreadsheet"),
      "name\temail\nA\ta@jpc.test",
    );
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText(/1 new · /);
    fireEvent.press(screen.getByText("Import 1 student"));

    expect(await screen.findByText(/safe to run the same paste again/i)).toBeTruthy();
  });
});

describe("ImportScreen — alumni mode and the way out", () => {
  it("imports as alumni of a graduation year with no season, then offers View users", async () => {
    useSessionStore.setState(superSession);
    post
      .mockResolvedValueOnce(previewBody())
      .mockResolvedValueOnce({ data: { data: { created: 1, skipped: 0, enrolled: 0, rows: [] } } });
    renderWithProviders(<ImportScreen />);

    fireEvent.press(await screen.findByText("Alumni"));
    expect(screen.queryByLabelText("Season")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Graduation year"), "2020");
    fireEvent.changeText(
      screen.getByLabelText("Paste your spreadsheet"),
      "name\temail\nA\ta@jpc.test",
    );
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText(/1 new · /);
    fireEvent.press(screen.getByText("Import 1 student"));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1]).toMatchObject({
      mode: "alumni",
      graduationYear: 2020,
      onExisting: "skip",
    });
    fireEvent.press(await screen.findByText("View users"));
    expect(mockPush).toHaveBeenCalledWith("/users");
  });
});
