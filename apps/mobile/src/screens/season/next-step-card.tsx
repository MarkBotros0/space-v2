/**
 * The one thing a season is waiting for, said in words with its button:
 * Start season on a draft, End season once the end date has passed.
 */
import { View } from "react-native";

import { cn } from "../../design/lib/cn";
import { Button } from "../../design/ui/button";
import { Text } from "../../design/ui/text";

export function NextStepCard({
  title,
  body,
  action,
  tone = "info",
}: {
  title: string;
  body: string;
  action: { label: string; onPress: () => void };
  tone?: "info" | "warn";
}) {
  return (
    <View
      testID="next-step"
      className={cn("flex-col gap-3 rounded-group p-4", tone === "warn" ? "bg-warn-soft" : "bg-info-soft")}
    >
      <View className="flex-col gap-1">
        <Text variant="headline">{title}</Text>
        <Text variant="subhead" className="text-foreground">
          {body}
        </Text>
      </View>
      <Button className="self-start" onPress={action.onPress}>
        {action.label}
      </Button>
    </View>
  );
}
