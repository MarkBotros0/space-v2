/**
 * A student's essays, for a progress row with more than one handed in: one
 * row each (ListRow, 52pt), named as its chip ("Essay 2: waiting review"),
 * opening that essay's review.
 */
import { useRouter } from "expo-router";
import { View } from "react-native";

import { GroupedList, ListRow, Sheet } from "../../design/ui";
import { usePrefetchSubmission } from "../../hooks/use-submission";
import type { HandedInEssay } from "./progress-model";

export type EssayListing = { name: string; essays: HandedInEssay[] };

export function EssayListSheet({
  open,
  listing,
  onClose,
}: {
  open: boolean;
  listing: EssayListing | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const prefetch = usePrefetchSubmission();
  return (
    <Sheet open={open} onClose={onClose} title={listing ? `Essays by ${listing.name}` : "Essays"}>
      <View className="pb-4">
        <GroupedList>
          {(listing?.essays ?? []).map((essay) => (
            <ListRow
              key={essay.publicId}
              title={essay.label}
              titleLines={2}
              chevron
              onPressIn={() => prefetch(essay.publicId)}
              onPress={() => {
                onClose();
                router.push({ pathname: "/submission/[publicId]", params: { publicId: essay.publicId } });
              }}
            />
          ))}
        </GroupedList>
      </View>
    </Sheet>
  );
}
