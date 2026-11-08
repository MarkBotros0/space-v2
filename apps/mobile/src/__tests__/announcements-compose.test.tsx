import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: "7" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";
import { detailItem, ok } from "./helpers/announcements";

import NewAnnouncementScreen from "../../app/(app)/announcements/new";
import EditAnnouncementScreen from "../../app/(app)/announcements/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const season = { id: 3, code: "SP26", title: "Test Season", reach: 1 };
const superTargets = {
  community: true,
  communityReach: 120,
  seasons: [season, { id: 4, code: "SU26", title: "Summer", reach: 30 }],
};
const adminTargets = { community: false, communityReach: 0, seasons: [season] };

function targetsAre(data: unknown) {
  get.mockImplementation((url: string) =>
    url.endsWith("/targets") ? ok(data) : Promise.reject(new Error(`unexpected ${url}`)),
  );
}

function apiError(status: number, code: string, message: string) {
  const err = new AxiosError("fail");
  err.response = { status, data: { error: { code, message } } } as AxiosResponse;
  return err;
}

const sheetBar = () => within(screen.getByTestId("sheet-save-bar"));

async function fill(body: string) {
  fireEvent.changeText(await screen.findByLabelText("Message"), body);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: "7" };
});

describe("New announcement", () => {
  it("shows a Super the Everyone / A season control, and the season picker after switching", async () => {
    targetsAre(superTargets);
    renderWithProviders(<NewAnnouncementScreen />);
    expect(await screen.findByText("Everyone")).toBeTruthy();
    expect(screen.queryByLabelText("Season")).toBeNull();
    fireEvent.press(screen.getByText("A season"));
    fireEvent.press(screen.getByLabelText("Season"));
    expect(screen.getByText("Summer")).toBeTruthy();
  });

  it("shows an admin 'To: Test Season' and no control", async () => {
    targetsAre(adminTargets);
    renderWithProviders(<NewAnnouncementScreen />);
    expect(await screen.findByText("To: Test Season")).toBeTruthy();
    expect(screen.queryByText("A season")).toBeNull();
    expect(screen.queryByLabelText("Season")).toBeNull();
  });

  it("says they can't post here when there are no targets", async () => {
    targetsAre({ community: false, communityReach: 0, seasons: [] });
    renderWithProviders(<NewAnnouncementScreen />);
    expect(await screen.findByText("You can't post announcements here")).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("shows field errors inline and does not open the confirm sheet when empty", async () => {
    targetsAre(adminTargets);
    renderWithProviders(<NewAnnouncementScreen />);
    await screen.findByLabelText("Message");
    // A post is its message alone: there is no title field.
    expect(screen.queryByLabelText("Title")).toBeNull();
    fireEvent.press(screen.getByText("Post"));
    expect(screen.getByLabelText("Message").props.accessibilityHint).toBeTruthy();
    expect(screen.queryByText("Post to Test Season?")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("confirms with the reach, then posts and replaces to the new post", async () => {
    targetsAre(superTargets);
    post.mockResolvedValue(ok(detailItem(42)));
    renderWithProviders(<NewAnnouncementScreen />);
    await fill("  Body text  ");
    fireEvent.press(screen.getByText("Post"));
    expect(await screen.findByText("Post to Everyone?")).toBeTruthy();
    expect(screen.getByText("This notifies 120 people.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.press(sheetBar().getByText("Post"));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/announcements/[id]",
        params: { id: "42" },
      }),
    );
    expect(post).toHaveBeenCalledWith("/api/v1/announcements", {
      audience: "COMMUNITY",
      body: "Body text",
    });
  });

  it("posts to the chosen season and says '1 person' for a reach of one", async () => {
    targetsAre(adminTargets);
    post.mockResolvedValue(ok(detailItem(43, { audience: "SEASON", seasonId: 3 })));
    renderWithProviders(<NewAnnouncementScreen />);
    await fill("There");
    fireEvent.press(screen.getByText("Post"));
    expect(await screen.findByText("Post to Test Season?")).toBeTruthy();
    expect(screen.getByText("This notifies 1 person.")).toBeTruthy();
    fireEvent.press(sheetBar().getByText("Post"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/v1/announcements", {
      audience: "SEASON",
      seasonId: 3,
      body: "There",
    });
  });

  it("cancel closes the sheet without posting", async () => {
    targetsAre(adminTargets);
    renderWithProviders(<NewAnnouncementScreen />);
    await fill("There");
    fireEvent.press(screen.getByText("Post"));
    await screen.findByText("Post to Test Season?");
    fireEvent.press(sheetBar().getByText("Cancel"));
    expect(post).not.toHaveBeenCalled();
  });

  it("shows a 409 message as a callout above the fields", async () => {
    targetsAre(adminTargets);
    post.mockRejectedValue(apiError(409, "season_finished", "This season has finished."));
    renderWithProviders(<NewAnnouncementScreen />);
    await fill("There");
    fireEvent.press(screen.getByText("Post"));
    await screen.findByText("Post to Test Season?");
    fireEvent.press(sheetBar().getByText("Post"));
    expect(await screen.findByText("This season has finished.")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows the message counter past 4000 characters and not at 4000", async () => {
    targetsAre(adminTargets);
    renderWithProviders(<NewAnnouncementScreen />);
    await fill("a".repeat(4000));
    expect(screen.queryByText(/ \/ 5000$/)).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Message"), "a".repeat(4001));
    expect(screen.getByText("4001 / 5000")).toBeTruthy();
  });

  it("announces a write error as a polite live region", async () => {
    targetsAre(adminTargets);
    post.mockRejectedValue(apiError(409, "season_finished", "This season has finished."));
    renderWithProviders(<NewAnnouncementScreen />);
    await fill("There");
    fireEvent.press(screen.getByText("Post"));
    await screen.findByText("Post to Test Season?");
    fireEvent.press(sheetBar().getByText("Post"));
    await screen.findByText("This season has finished.");
    expect(screen.getByRole("alert").props.accessibilityLiveRegion).toBe("polite");
  });
});

describe("Edit announcement", () => {
  it("shows To read-only and goes back after saving", async () => {
    get.mockReturnValue(
      ok(detailItem(7, { canEdit: true, audience: "SEASON", seasonId: 3, seasonTitle: "Test Season", body: "Old body" })),
    );
    patch.mockResolvedValue(ok(detailItem(7)));
    renderWithProviders(<EditAnnouncementScreen />);
    expect(await screen.findByText("To: Test Season")).toBeTruthy();
    expect(screen.queryByText("A season")).toBeNull();
    expect(screen.getByLabelText("Message").props.value).toBe("Old body");
    fireEvent.changeText(screen.getByLabelText("Message"), "New body");
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith("/api/v1/announcements/7", { body: "New body" });
  });

  it("says Everyone for a community post", async () => {
    get.mockReturnValue(ok(detailItem(7, { canEdit: true })));
    renderWithProviders(<EditAnnouncementScreen />);
    expect(await screen.findByText("To: Everyone")).toBeTruthy();
  });

  it("shows an empty state, not the form, when it can't be edited", async () => {
    get.mockReturnValue(ok(detailItem(7, { canEdit: false })));
    renderWithProviders(<EditAnnouncementScreen />);
    expect(await screen.findByText("This announcement can't be edited")).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("shows the same empty state for a removed post", async () => {
    const err = apiError(404, "not_found", "Not found");
    get.mockRejectedValue(err);
    renderWithProviders(<EditAnnouncementScreen />);
    expect(await screen.findByText("This announcement can't be edited")).toBeTruthy();
  });

  it("shows a 409 on save inline and stays", async () => {
    get.mockReturnValue(ok(detailItem(7, { canEdit: true })));
    patch.mockRejectedValue(apiError(409, "season_finished", "This season has finished."));
    renderWithProviders(<EditAnnouncementScreen />);
    await screen.findByLabelText("Message");
    fireEvent.changeText(screen.getByLabelText("Message"), "x");
    fireEvent.press(screen.getByText("Save"));
    expect(await screen.findByText("This season has finished.")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
