// apps/mobile/src/__tests__/student-import.test.tsx
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
  adminSession,
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

describe("ImportScreen — step 1, paste", () => {
  it("shows the role gate for a non-SUPER caller and never calls the API", async () => {
    useSessionStore.setState(adminSession);
    renderWithProviders(<ImportScreen />);

    expect(await screen.findByText(/isn't available for your role/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("says plainly that file upload is unavailable, rather than just omitting a picker (D-16.3)", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<ImportScreen />);

    expect(await screen.findByText(/file upload arrives with the CMS/i)).toBeTruthy();
  });

  it('renders the recognised columns from the template, including the "student" alias', async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<ImportScreen />);

    expect(await screen.findByText(/name, student/i)).toBeTruthy();
  });

  it("shows the sample header with visible separators, never a tab that collapses on a phone (sweep F1)", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<ImportScreen />);

    const field = await screen.findByLabelText("Paste your spreadsheet");
    expect(field.props.placeholder).not.toMatch(/\t/);
    expect(field.props.placeholder).toContain("name | email");
    expect(screen.getAllByText("name | email").length).toBeGreaterThan(0);
  });

  it("refuses an over-long paste locally, without spending a request", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<ImportScreen />);

    const field = await screen.findByLabelText("Paste your spreadsheet");
    fireEvent.changeText(field, "x".repeat(262145));
    fireEvent.press(screen.getByText("Preview"));

    expect(await screen.findByText(/too long/i)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("posts the paste and moves to the preview step", async () => {
    useSessionStore.setState(superSession);
    post.mockResolvedValue(previewBody());
    renderWithProviders(<ImportScreen />);

    fireEvent.changeText(
      await screen.findByLabelText("Paste your spreadsheet"),
      "name\temail\nA\ta@jpc.test",
    );
    fireEvent.press(screen.getByText("Preview"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/imports/students/preview", {
        text: "name\temail\nA\ta@jpc.test",
        delimiter: "auto",
      }),
    );
    expect(await screen.findByText(/1 new · /)).toBeTruthy();
  });
});

describe("ImportScreen — step 1, the season picker", () => {
  it("lists the seasons from Plan 4's useSeasons and keeps Import disabled until one is chosen", async () => {
    useSessionStore.setState(superSession);
    post.mockResolvedValue(previewBody());
    renderWithProviders(<ImportScreen />);

    expect(await screen.findByLabelText("Season")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons");

    fireEvent.changeText(
      screen.getByLabelText("Paste your spreadsheet"),
      "name\temail\nA\ta@jpc.test",
    );
    fireEvent.press(screen.getByText("Preview"));
    await screen.findByText(/1 new · /);

    // No season chosen: the commit is refused client-side (it would 400), and
    // the screen says why instead of sending `seasonId: null`.
    expect(screen.getByText("Pick a season first")).toBeTruthy();
    fireEvent.press(screen.getByText("Pick a season first"));
    expect(post).toHaveBeenCalledTimes(1);
  });
});
