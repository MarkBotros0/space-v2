/**
 * One catalogue section: a header and a stable `catalogue-<id>` testID, with
 * `catalogue-<id>-title` on the header, which the sweep flow swipes to the top
 * of the screen before each shot. Fake data only; nothing touches the network.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "../../design/ui/text";

export function CatalogueSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <View testID={`catalogue-${id}`} className="mb-8 gap-3">
      <Text testID={`catalogue-${id}-title`} variant="title" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}
