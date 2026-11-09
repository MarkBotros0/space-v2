import { View } from "react-native";

import { Button } from "../../design/ui/button";
import { PillButton } from "../../design/ui/pill-button";
import { Text } from "../../design/ui/text";
import { CatalogueSection } from "./section";

const VARIANTS = ["primary", "secondary", "destructive", "plain"] as const;

export function TypeSection() {
  return (
    <CatalogueSection id="type" title="Text">
      <Text variant="largeTitle">Large title</Text>
      <Text variant="title">Title</Text>
      <Text variant="headline">Headline</Text>
      <Text variant="body">Body: the quick brown fox jumps over the lazy dog.</Text>
      <Text variant="subhead">Subhead: a secondary line of copy.</Text>
      <Text variant="caption">Caption: small print</Text>
      <Text variant="body" tabular>
        Tabular 0123456789
      </Text>
      <Text variant="body" tabular>
        Tabular 1111111111
      </Text>
    </CatalogueSection>
  );
}

export function ButtonsSection() {
  return (
    <CatalogueSection id="buttons" title="Buttons">
      {(["md", "sm"] as const).map((size) => (
        <View key={size} className="flex-row flex-wrap gap-2">
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} size={size} onPress={() => {}}>
              {`${variant} ${size}`}
            </Button>
          ))}
        </View>
      ))}
      <View className="flex-row flex-wrap gap-2">
        <Button loading onPress={() => {}}>
          Saving
        </Button>
        <Button variant="secondary" loading onPress={() => {}}>
          Loading
        </Button>
        <Button disabled onPress={() => {}}>
          Disabled
        </Button>
        <Button variant="secondary" disabled onPress={() => {}}>
          Disabled
        </Button>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <PillButton label="See all" onPress={() => {}} />
        <PillButton label="Clear due date" onPress={() => {}} />
        <PillButton destructive label="Remove poll" onPress={() => {}} />
      </View>
    </CatalogueSection>
  );
}
