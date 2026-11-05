/**
 * A Settings section whose body is a form: the grouped-list section header
 * over a surface card holding the one-line description and the fields. A
 * section made of rows is a `GroupedList` with the same header instead.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { ListSectionHeader } from "../ui/grouped-list";
import { Text } from "../ui/text";

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <View>
      <ListSectionHeader>{title}</ListSectionHeader>
      <View className="rounded-group bg-surface p-4">
        <Text variant="caption" className="mb-4 text-muted-foreground">
          {description}
        </Text>
        {children}
      </View>
    </View>
  );
}
