import { View } from "react-native";

import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Text } from "../../design/ui/text";

/**
 * The one confirm before an edit changes a poll's votes. When the server says more votes
 * arrived than the app knew of, the same sheet swaps its words (never a second modal).
 */
export function ConfirmEditSheet({
  open,
  lines,
  serverLostVotes,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  lines: string[];
  serverLostVotes: number | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const fresh = serverLostVotes !== null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save these changes?"
      footer={
        <SheetSaveBar
          label="Save changes"
          onPress={onConfirm}
          loading={pending}
          secondary={{ label: "Cancel", onPress: onClose, disabled: pending }}
          beside
        />
      }
    >
      <View className="flex-col gap-2 pb-4">
        {fresh ? (
          <Text variant="body" className="text-foreground">
            {`New votes came in: this change now deletes ${serverLostVotes === 1 ? "1 vote" : `${serverLostVotes} votes`}.`}
          </Text>
        ) : (
          lines.map((line) => (
            <Text key={line} variant="body" className="text-foreground">
              {line}
            </Text>
          ))
        )}
      </View>
    </Sheet>
  );
}
