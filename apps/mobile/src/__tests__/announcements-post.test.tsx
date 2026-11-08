import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";

jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({ id: "7" }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";
import { detailItem, ok } from "./helpers/announcements";

import AnnouncementScreen from "../../app/(app)/announcements/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const del = apiClient.delete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  post.mockResolvedValue({ data: { data: {} } });
  del.mockResolvedValue({ data: { data: {} } });
});

describe("AnnouncementScreen", () => {
  it("shows the audience, title, meta line and a linkified body", async () => {
    get.mockReturnValue(ok(detailItem(7, { audience: "SEASON", seasonTitle: "Spring 2026" })));
    renderWithProviders(<AnnouncementScreen />);
    expect((await screen.findAllByText("Post 7")).length).toBeGreaterThan(0);
    expect(screen.getByText("Spring 2026")).toBeTruthy();
    expect(screen.getByText(/^Sam Author · 3 Nov 2026, \d{2}:\d{2}$/)).toBeTruthy();
    expect(screen.getByRole("link")).toBeTruthy();
  });

  it("marks an unread post read once, and a read post not at all", async () => {
    get.mockReturnValue(ok(detailItem(7, { isRead: false })));
    const first = renderWithProviders(<AnnouncementScreen />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/api/v1/announcements/7/read");
    first.unmount();

    post.mockClear();
    get.mockReturnValue(ok(detailItem(7, { isRead: true })));
    renderWithProviders(<AnnouncementScreen />);
    await screen.findAllByText("Post 7");
    expect(post).not.toHaveBeenCalled();
  });

  it("shows Edit and Delete only with canEdit and canDelete", async () => {
    get.mockReturnValue(ok(detailItem(7)));
    const first = renderWithProviders(<AnnouncementScreen />);
    await screen.findAllByText("Post 7");
    expect(screen.queryByLabelText("Edit announcement")).toBeNull();
    expect(screen.queryByLabelText("Delete announcement")).toBeNull();
    first.unmount();

    get.mockReturnValue(ok(detailItem(7, { canEdit: true })));
    const second = renderWithProviders(<AnnouncementScreen />);
    fireEvent.press(await screen.findByLabelText("Edit announcement"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/announcements/[id]/edit",
      params: { id: "7" },
    });
    expect(screen.queryByLabelText("Delete announcement")).toBeNull();
    second.unmount();

    get.mockReturnValue(ok(detailItem(7, { canDelete: true })));
    renderWithProviders(<AnnouncementScreen />);
    expect(await screen.findByLabelText("Delete announcement")).toBeTruthy();
    expect(screen.queryByLabelText("Edit announcement")).toBeNull();
  });

  it("confirms the delete in one dialog, then goes back to the list", async () => {
    get.mockReturnValue(ok(detailItem(7, { canDelete: true })));
    renderWithProviders(<AnnouncementScreen />);
    fireEvent.press(await screen.findByLabelText("Delete announcement"));
    expect(screen.getByText("Delete this announcement?")).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    const confirm = screen.getAllByText("Delete");
    fireEvent.press(confirm[confirm.length - 1]!);
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/announcements/7"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/announcements"));
    expect(toast.success).toHaveBeenCalledWith("Announcement deleted");
  });

  it("shows the error and stays when the delete fails", async () => {
    get.mockReturnValue(ok(detailItem(7, { canDelete: true })));
    del.mockRejectedValue(
      new AxiosError("bad", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        data: { error: { code: "conflict", message: "Season is locked." } },
      } as AxiosResponse),
    );
    renderWithProviders(<AnnouncementScreen />);
    fireEvent.press(await screen.findByLabelText("Delete announcement"));
    const confirm = screen.getAllByText("Delete");
    fireEvent.press(confirm[confirm.length - 1]!);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("says the post was removed on a 404", async () => {
    get.mockRejectedValue(
      new AxiosError("nf", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 404,
        data: { error: { code: "not_found", message: "Not found" } },
      } as AxiosResponse),
    );
    renderWithProviders(<AnnouncementScreen />);
    expect(await screen.findByText("This post was removed")).toBeTruthy();
  });
});
