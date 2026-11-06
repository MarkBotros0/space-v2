import { useRouter } from "expo-router";
import { View } from "react-native";

import { Button, Text } from "../../design/ui";
import { useOverdueSeasons } from "../../hooks/use-season-end";

/**
 * Admin and Super Today: a season whose end date has passed and is still
 * active. Renders nothing while loading, on failure, or with none overdue, so
 * Today never waits on it. Names the first season and says how many wait behind it.
 */
export function OverdueCallout() {
  const router = useRouter();
  const overdue = useOverdueSeasons(true);
  const first = overdue.data?.[0];
  if (!first) return null;
  const more = (overdue.data?.length ?? 1) - 1;
  return (
    <View className="flex-col gap-3 rounded-group bg-surface p-4">
      <View className="flex-col gap-1">
        <Text variant="headline" accessibilityRole="header">
          {`${first.title} has ended`}
        </Text>
        <Text variant="subhead" className="text-muted-foreground">
          {"Its end date has passed. End it so students get their results." +
            (more > 0 ? ` ${more} more ${more === 1 ? "season is" : "seasons are"} also waiting.` : "")}
        </Text>
      </View>
      <Button
        className="self-start"
        onPress={() => router.push({ pathname: "/seasons/[code]/end", params: { code: first.code } })}
      >
        End season
      </Button>
    </View>
  );
}
