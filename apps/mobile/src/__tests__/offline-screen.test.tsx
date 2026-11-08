import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";

import { OfflineScreen, SHOW_AFTER_MS } from "../design/layout/offline-screen";
import { renderWithProviders } from "./helpers/render";

const refresh = NetInfo.refresh as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  onlineManager.setOnline(true);
});
afterEach(() => {
  act(() => onlineManager.setOnline(true));
  jest.useRealTimers();
});

describe("OfflineScreen (owner, 2026-11-08)", () => {
  it("stays away online and for a short drop, then covers the app once offline for a while", () => {
    renderWithProviders(<OfflineScreen />);
    expect(screen.queryByTestId("offline-screen")).toBeNull();
    act(() => onlineManager.setOnline(false));
    act(() => jest.advanceTimersByTime(SHOW_AFTER_MS - 1));
    expect(screen.queryByTestId("offline-screen")).toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByTestId("offline-screen")).toBeTruthy();
    expect(screen.getByText("You're offline")).toBeTruthy();
  });

  it("leaves by itself the moment the connection is back", () => {
    renderWithProviders(<OfflineScreen />);
    act(() => onlineManager.setOnline(false));
    act(() => jest.advanceTimersByTime(SHOW_AFTER_MS));
    expect(screen.getByTestId("offline-screen")).toBeTruthy();
    act(() => onlineManager.setOnline(true));
    expect(screen.queryByTestId("offline-screen")).toBeNull();
  });

  it("a short blip never shows it", () => {
    renderWithProviders(<OfflineScreen />);
    act(() => onlineManager.setOnline(false));
    act(() => jest.advanceTimersByTime(SHOW_AFTER_MS / 2));
    act(() => onlineManager.setOnline(true));
    act(() => jest.advanceTimersByTime(SHOW_AFTER_MS * 2));
    expect(screen.queryByTestId("offline-screen")).toBeNull();
  });

  it("Try again says so politely when still offline, and closes when NetInfo finds a connection", async () => {
    renderWithProviders(<OfflineScreen />);
    act(() => onlineManager.setOnline(false));
    act(() => jest.advanceTimersByTime(SHOW_AFTER_MS));

    refresh.mockResolvedValueOnce({ isConnected: false });
    await act(async () => fireEvent.press(screen.getByText("Try again")));
    expect(screen.getByText(/Still no connection/)).toBeTruthy();

    refresh.mockResolvedValueOnce({ isConnected: true });
    await act(async () => fireEvent.press(screen.getByText("Try again")));
    expect(screen.queryByTestId("offline-screen")).toBeNull();
  });
});
