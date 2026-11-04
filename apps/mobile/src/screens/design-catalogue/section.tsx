/**
 * One catalogue section: a header and a stable `catalogue-<id>` testID the
 * sweep flow scrolls to. Fake data only; nothing here touches the network.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "../../design/ui/text";

export function CatalogueSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <View testID={`catalogue-${id}`} className="mb-8 gap-3">
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}
