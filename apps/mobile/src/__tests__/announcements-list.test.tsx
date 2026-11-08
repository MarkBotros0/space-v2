import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), dismissTo: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";
import { listItem, ok } from "./helpers/announcements";

import AnnouncementsScreen from "../../app/(app)/announcements/index";

const get = apiClient.get as jest.Mock;

function serve(items: unknown[], targets: unknown, nextCursor: string | null = null) {
  get.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/announcements/targets")) return ok(targets);
    return ok({ items, nextCursor });
  });
}
const noTargets = { community: false, communityReach: 0, seasons: [] };

beforeEach(() => jest.clearAllMocks());

describe("AnnouncementsScreen", () => {
  it("renders a card per post with the audience, meta line and an Edited marker", async () => {
    serve(
      [
        listItem(1, { audience: "SEASON", seasonId: 4, seasonTitle: "Spring 2026" }),
        listItem(2, { editedAt: "2026-11-04T12:00:00.000Z", authorName: null }),
      ],
      noTargets,
    );
    renderWithProviders(<AnnouncementsScreen />);
    expect(await screen.findByText("Excerpt 1")).toBeTruthy();
    expect(screen.getByText("Spring 2026")).toBeTruthy();
    expect(screen.getByText("Everyone")).toBeTruthy();
    expect(screen.getByText("Excerpt 1")).toBeTruthy();
    expect(screen.getByText("Sam Author · 3 Nov")).toBeTruthy();
    expect(screen.getByText("Former member · 3 Nov · Edited")).toBeTruthy();
  });

  it("says New in words on an unread post only, and opens it on press", async () => {
    serve([listItem(1, { isRead: false }), listItem(2)], noTargets);
    renderWithProviders(<AnnouncementsScreen />);
    await screen.findByText("Excerpt 1");
    expect(screen.getAllByText("New")).toHaveLength(1);
    fireEvent.press(screen.getByLabelText(/^Excerpt 1/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/announcements/[id]",
      params: { id: "1" },
    });
  });

  it("shows New post only when the viewer can post somewhere", async () => {
    serve([listItem(1)], noTargets);
    const first = renderWithProviders(<AnnouncementsScreen />);
    await screen.findByText("Excerpt 1");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/announcements/targets"));
    expect(screen.queryByText("New post")).toBeNull();
    first.unmount();

    serve([listItem(1)], { community: true, communityReach: 9, seasons: [] });
    renderWithProviders(<AnnouncementsScreen />);
    fireEvent.press(await screen.findByText("New post"));
    expect(mockPush).toHaveBeenCalledWith("/announcements/new");
  });

  it("shows New post for a season admin with a season to post to", async () => {
    serve([listItem(1)], {
      community: false,
      communityReach: 0,
      seasons: [{ id: 4, code: "S4", title: "Spring", reach: 3 }],
    });
    renderWithProviders(<AnnouncementsScreen />);
    expect(await screen.findByText("New post")).toBeTruthy();
  });

  it("shows the empty state", async () => {
    serve([], noTargets);
    renderWithProviders(<AnnouncementsScreen />);
    expect(await screen.findByText("No announcements yet")).toBeTruthy();
  });

  it("offers a New announcement action on an empty feed to someone who can post", async () => {
    serve([], { community: false, communityReach: 0, seasons: [{ id: 4, code: "S4", title: "Spring", reach: 3 }] });
    renderWithProviders(<AnnouncementsScreen />);
    expect(await screen.findByText("Post something for your season")).toBeTruthy();
    fireEvent.press(screen.getByText("New announcement"));
    expect(mockPush).toHaveBeenCalledWith("/announcements/new");
  });

  it("says everyone on an empty feed when a Super can post to the community", async () => {
    serve([], { community: true, communityReach: 9, seasons: [] });
    renderWithProviders(<AnnouncementsScreen />);
    expect(await screen.findByText("Post something for everyone")).toBeTruthy();
  });

  it("offers no post action on an empty feed to someone who cannot post", async () => {
    serve([], noTargets);
    renderWithProviders(<AnnouncementsScreen />);
    await screen.findByText("No announcements yet");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/announcements/targets"));
    expect(screen.queryByText("New announcement")).toBeNull();
  });

  it("shows the error state and retries the feed", async () => {
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/announcements/targets") ? ok(noTargets) : Promise.reject(new Error("boom")),
    );
    renderWithProviders(<AnnouncementsScreen />);
    const retry = await screen.findByText("Try again");
    const before = get.mock.calls.filter(([u]) => u === "/api/v1/announcements").length;
    fireEvent.press(retry);
    await waitFor(() =>
      expect(get.mock.calls.filter(([u]) => u === "/api/v1/announcements").length).toBeGreaterThan(before),
    );
  });

  it("loads the next page on demand", async () => {
    serve([listItem(1)], noTargets, "c1");
    renderWithProviders(<AnnouncementsScreen />);
    fireEvent.press(await screen.findByText("Load more"));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/api/v1/announcements?cursor=c1"),
    );
  });
});
