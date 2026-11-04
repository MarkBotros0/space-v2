import { Inbox } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { InlineError, RouteError } from "../../design/layout/route-states";
import { Button } from "../../design/ui/button";
import { EmptyState } from "../../design/ui/empty-state";
import { Input } from "../../design/ui/input";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Skeleton, SkeletonCard } from "../../design/ui/skeleton";
import { Text } from "../../design/ui/text";
import { toast } from "../../design/ui/toaster";
import { CatalogueSection } from "./section";

export function StatesSection() {
  return (
    <CatalogueSection id="states" title="Empty, error and loading">
      <EmptyState
        icon={Inbox}
        title="Nothing here yet"
        description="When a leader posts an assignment it shows up here."
        action={{ label: "Refresh", onPress: () => {} }}
      />
      <RouteError onRetry={() => {}} />
      <InlineError message="Couldn't load this card." onRetry={() => {}} />
      <View className="gap-3">
        <Skeleton height={64} radius={16} />
        <SkeletonCard />
      </View>
    </CatalogueSection>
  );
}

export function ToastSection() {
  return (
    <CatalogueSection id="toast" title="Toast">
      <View className="flex-row flex-wrap gap-2">
        <Button testID="catalogue-toast-button" variant="secondary" onPress={() => toast.success("Saved", { description: "Nothing was written." })}>
          Show toast
        </Button>
      </View>
    </CatalogueSection>
  );
}

/** The sheet's save only closes it: the catalogue never writes. */
export function SheetSection() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <CatalogueSection id="sheet" title="Sheet">
      <View className="flex-row flex-wrap gap-2">
        <Button testID="catalogue-open-sheet" variant="secondary" onPress={() => setOpen(true)}>
          Open sheet
        </Button>
      </View>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add a note"
        footer={<SheetSaveBar label="Save note" onPress={() => setOpen(false)} />}
      >
        <View className="gap-2 pb-4">
          <Text variant="subhead" className="text-muted-foreground">
            Example sheet with an input. Saving only closes it.
          </Text>
          <Input
            testID="catalogue-sheet-input"
            accessibilityLabel="Sheet note"
            placeholder="Write something"
            value={note}
            onChangeText={setNote}
            size="lg"
          />
        </View>
      </Sheet>
    </CatalogueSection>
  );
}
