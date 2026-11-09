import { View } from "react-native";

import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Text } from "../../design/ui/text";
import { people } from "../../lib/plural";

/** "1 person", "120 people": a reach of exactly one is singular. */
/** The one confirm before a post goes out: who it reaches, with Cancel and Post in one Sheet. */
export function ConfirmPostSheet({
  open,
  audienceLabel,
  reach,
  withPoll = false,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** "Everyone" or the season's title. */
  audienceLabel: string;
  reach: number;
  /** The post carries a poll: the summary says so. */
  withPoll?: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Post to ${audienceLabel}?`}
      footer={
        <SheetSaveBar
          label="Post"
          onPress={onConfirm}
          loading={pending}
          secondary={{ label: "Cancel", onPress: onClose, disabled: pending }}
          beside
        />
      }
    >
      <View className="pb-4">
        <Text variant="body" className="text-foreground">
          {`This notifies ${people(reach)}${withPoll ? ", with a poll" : ""}.`}
        </Text>
      </View>
    </Sheet>
  );
}
