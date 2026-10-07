import { View } from "react-native";

import { checkInCopy, type CheckInOutcome } from "../../lib/check-in-result";
import { useTheme } from "../../theme";
import { Text } from "../../ui";

export function CheckInResult({ outcome }: { outcome: CheckInOutcome }) {
  const theme = useTheme();
  const copy = checkInCopy(outcome);
  const ok = outcome.kind === "checked_in";
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ gap: theme.spacing.xs }}>
      <Text variant="heading" color={ok ? theme.colors.success[700] : theme.colors.error[600]}>
        {copy.title}
      </Text>
      {copy.message ? <Text variant="body">{copy.message}</Text> : null}
    </View>
  );
}
