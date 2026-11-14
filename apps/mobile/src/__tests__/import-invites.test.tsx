import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { ImportInvites } from "../screens/user-import/import-invites";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const pendingIs = (pending: number) => get.mockResolvedValue({ data: { data: { pending } } });
const confirmSend = () => {
  const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  buttons.find((b: { text: string }) => b.text === "Send").onPress();
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("ImportInvites — sending invites from the import result", () => {
  it("shows nothing while nobody is waiting for an invite", async () => {
    pendingIs(0);
    renderWithProviders(<ImportInvites />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/users/invites/pending"));
    expect(screen.queryByText("Send invites")).toBeNull();
  });

  it("sends one batch after a confirm and keeps its counts on screen", async () => {
    pendingIs(3);
    post.mockResolvedValue({ data: { data: { sent: 3, failed: 0, skipped: 0, remaining: 0 } } });
    renderWithProviders(<ImportInvites />);
    expect(await screen.findByText(/3 people are waiting for an invite/)).toBeTruthy();

    fireEvent.press(screen.getByText("Send 3 invites"));
    expect(Alert.alert).toHaveBeenCalledWith("Send invites to 3 people?", undefined, expect.any(Array));
    pendingIs(0);
    confirmSend();

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/users/invites/pending", undefined, expect.anything()),
    );
    expect(
      await screen.findByText(/Sent 3 · failed 0 · skipped 0 · 0 still pending\. Everyone has an invite now\./),
    ).toBeTruthy();
  });

  it("offers the next batch when more are waiting than one tap sends", async () => {
    pendingIs(45);
    renderWithProviders(<ImportInvites />);
    fireEvent.press(await screen.findByText("Send the next 20 invites"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Send invites to 20 people?",
      "45 people are waiting. 20 are sent per tap.",
      expect.any(Array),
    );
  });
});
