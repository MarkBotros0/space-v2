import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { post: jest.fn() } }));
let mockParams: Record<string, string> = { token: "AbC123XyZ0" };
const mockReplace = jest.fn();
jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ replace: mockReplace }),
    Redirect: ({ href }: { href: unknown }) => <Text testID="redirect">{JSON.stringify(href)}</Text>,
  };
});

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import CheckInLinkScreen from "../../app/checkin/[token]";

const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { token: "AbC123XyZ0" };
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("CheckInLinkScreen", () => {
  it("sends an anonymous visitor to login carrying the way back (R56)", () => {
    useSessionStore.setState({ status: "anonymous" });

    renderWithProviders(<CheckInLinkScreen />);

    const href = JSON.parse(screen.getByTestId("redirect").props.children);
    expect(href).toEqual({ pathname: "/login", params: { returnTo: "/checkin/AbC123XyZ0" } });
    expect(post).not.toHaveBeenCalled();
  });

  it("does NOT check in on open — the write is an explicit press (spec 04 D3, C6, R69)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    post.mockResolvedValue({ data: { data: { status: "PRESENT", minutesLate: 0 } } });

    renderWithProviders(<CheckInLinkScreen />);

    expect(screen.getByText("Check in to the session this code belongs to?")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Check in"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/check-in", { token: "AbC123XyZ0" }));
    expect(await screen.findByText("You're checked in!")).toBeTruthy();
  });

  it("shows a refusal by its code", async () => {
    useSessionStore.setState(makeSession("STUDENT"));
    post.mockRejectedValue(
      Object.assign(new Error("403"), {
        isAxiosError: true,
        response: { status: 403, data: { error: { code: "not_enrolled", message: "x" } } },
      }),
    );

    renderWithProviders(<CheckInLinkScreen />);
    fireEvent.press(screen.getByText("Check in"));

    expect(await screen.findByText("You are not enrolled in this season.")).toBeTruthy();
  });

  it("rejects a malformed token without offering to check in, and never carries it through login", () => {
    mockParams = { token: "not-a-token" };
    useSessionStore.setState(makeSession("STUDENT"));
    const { unmount } = renderWithProviders(<CheckInLinkScreen />);
    expect(screen.getByText("This check-in link is not valid.")).toBeTruthy();
    expect(screen.queryByText("Check in")).toBeNull();
    unmount();

    useSessionStore.setState({ status: "anonymous" });
    renderWithProviders(<CheckInLinkScreen />);
    expect(JSON.parse(screen.getByTestId("redirect").props.children)).toBe("/login");
  });

  it("goes to the dashboard on request", () => {
    useSessionStore.setState(makeSession("STUDENT"));
    renderWithProviders(<CheckInLinkScreen />);
    fireEvent.press(screen.getByText("Go to dashboard"));
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });
});
