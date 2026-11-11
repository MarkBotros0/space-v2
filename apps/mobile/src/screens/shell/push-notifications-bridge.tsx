import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { queryKeys } from "../../lib/query-keys";
import { presentNotification } from "../../lib/notification-presentation";
import { routeForPushData } from "../../lib/push-routing";

// A push that arrives while the app is open still shows as a banner; without a
// handler iOS and Android drop it silently.
Notifications.setNotificationHandler({ handleNotification: presentNotification });

/**
 * Mounted once while signed in (root layout). Opens the right screen when a
 * push is tapped — also the tap that cold-started the app — and refreshes the
 * inbox and Home when a push arrives in the foreground. Renders nothing.
 */
export function PushNotificationsBridge() {
  const queryClient = useQueryClient();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    // The backend sends on channel "default"; Android 8+ needs it to exist.
    if (Platform.OS === "android") {
      void Notifications.setNotificationChannelAsync("default", {
        name: "Notifications",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all });
    });
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    router.push(routeForPushData(lastResponse.notification.request.content.data));
  }, [lastResponse, queryClient]);

  return null;
}
