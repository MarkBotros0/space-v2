/**
 * A save that the screen shows in place succeeds quietly (owner, 2026-11-13): a success haptic and no
 * toast. Needs the suite to mock `design/ui/toaster`.
 */
import { waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";

import { toast } from "../../design/ui/toaster";

export async function expectQuietSuccess(): Promise<void> {
  await waitFor(() => expect(Haptics.notificationAsync).toHaveBeenCalledWith("success"));
  expect(toast.success).not.toHaveBeenCalled();
}
