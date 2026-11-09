import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * Online when the device has a network connection. `isConnected` is null
 * before NetInfo's first reading: that counts as online, so a cold start
 * neither pauses the first queries nor flashes the offline banner.
 */
export function isOnlineState(state: Pick<NetInfoState, "isConnected">): boolean {
  return state.isConnected !== false;
}

/**
 * Feed React Query's onlineManager from NetInfo. React Query's own default
 * listens to the browser's online/offline events, which React Native never
 * fires, so without this it believes the app is always online: queries keep
 * firing (and failing) with no network, and nothing refetches on reconnect.
 * Once wired, queries pause while offline and resume — refetching anything
 * stale — when the connection comes back.
 *
 * Idempotent: setEventListener replaces the previous listener (and calls its
 * cleanup), so creating a second QueryClient doesn't stack subscriptions.
 */
export function connectOnlineManager(): void {
  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(isOnlineState(state))));
}

/** The onlineManager's current verdict, re-rendering when it changes. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
}
