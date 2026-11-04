import * as Haptics from "expo-haptics";

/** Fire-and-forget haptic feedback; never throws (unsupported device, web). */
export function haptic(kind: "success" | "light" | "selection"): void {
  try {
    const run =
      kind === "success"
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : kind === "light"
          ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          : Haptics.selectionAsync();
    Promise.resolve(run).catch(() => {});
  } catch {
    // ignore
  }
}
