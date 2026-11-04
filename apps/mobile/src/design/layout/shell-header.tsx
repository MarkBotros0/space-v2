import { View } from "react-native";

import { AppTopBar } from "./app-top-bar";
import { OfflineBanner } from "./offline-banner";

/**
 * v1's top bar, with the offline strip under it while there is no network.
 * The header of every signed-in screen: the tabs (`(app)/(tabs)/_layout.tsx`)
 * and the detail screens pushed over them (`(app)/_layout.tsx`), so both keep
 * the top safe-area inset and the offline strip (ruling R9).
 */
export function ShellHeader() {
  return (
    <View>
      <AppTopBar />
      <OfflineBanner />
    </View>
  );
}
