import NetInfo from "@react-native-community/netinfo";
import { onlineManager, useQuery } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { OfflineBanner } from "../design/layout/offline-banner";
import { connectOnlineManager, isOnlineState } from "../lib/online";
import { createQueryClient } from "../lib/query-client";
import { renderWithProviders } from "./helpers/render";

const addEventListener = NetInfo.addEventListener as jest.Mock;

/** The listener createQueryClient handed NetInfo, to play network changes into. */
function netInfoListener(): (state: { isConnected: boolean | null }) => void {
  const calls = addEventListener.mock.calls;
  return calls[calls.length - 1]![0];
}

beforeEach(() => {
  addEventListener.mockClear();
  addEventListener.mockReturnValue(jest.fn());
  connectOnlineManager();
});

afterEach(() => {
  act(() => onlineManager.setOnline(true));
});

describe("isOnlineState", () => {
  it("is offline only on a definite no — an unknown first reading counts as online", () => {
    expect(isOnlineState({ isConnected: false })).toBe(false);
    expect(isOnlineState({ isConnected: true })).toBe(true);
    expect(isOnlineState({ isConnected: null })).toBe(true);
  });
});

describe("onlineManager ← NetInfo", () => {
  it("createQueryClient subscribes the onlineManager to NetInfo", () => {
    addEventListener.mockClear();
    createQueryClient();
    expect(addEventListener).toHaveBeenCalledTimes(1);
  });

  it("follows NetInfo: offline on disconnect, online again on reconnect", () => {
    act(() => netInfoListener()({ isConnected: false }));
    expect(onlineManager.isOnline()).toBe(false);
    act(() => netInfoListener()({ isConnected: true }));
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("pauses a query while offline and fetches it on reconnect", async () => {
    act(() => netInfoListener()({ isConnected: false }));
    const fetcher = jest.fn().mockResolvedValue("fresh");
    function Probe() {
      const q = useQuery({ queryKey: ["offline-probe"], queryFn: fetcher });
      return <Text>{q.fetchStatus === "paused" ? "paused" : (q.data ?? "loading")}</Text>;
    }
    renderWithProviders(<Probe />);

    expect(await screen.findByText("paused")).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();

    act(() => netInfoListener()({ isConnected: true }));
    expect(await screen.findByText("fresh")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("OfflineBanner", () => {
  it("shows only while offline, with the warning tokens in both themes", async () => {
    renderWithProviders(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).toBeNull();

    act(() => netInfoListener()({ isConnected: false }));
    const banner = await screen.findByTestId("offline-banner");
    expect(screen.getByText(/You're offline/)).toBeTruthy();
    expect(banner.props.className).toContain("bg-warning-50");
    expect(banner.props.className).toContain("dark:bg-warning-950");
    expect(screen.getByText(/You're offline/).props.className).toContain("dark:text-warning-200");

    act(() => netInfoListener()({ isConnected: true }));
    await waitFor(() => expect(screen.queryByTestId("offline-banner")).toBeNull());
  });
});
