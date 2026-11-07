import { useState } from "react";
import { View } from "react-native";

import { LogoWriting } from "../../design/brand/logo-writing";
import { Button } from "../../design/ui/button";
import { CatalogueSection } from "./section";

/** The launch logo writing itself on the app background, as the launch screen shows it; Replay remounts it. */
export function LogoSection() {
  const [run, setRun] = useState(0);
  return (
    <CatalogueSection id="logo" title="Launch logo">
      <View className="items-center justify-center rounded-group border border-border bg-background py-8">
        <LogoWriting key={run} />
      </View>
      <Button testID="catalogue-logo-replay" variant="secondary" className="self-start" onPress={() => setRun((n) => n + 1)}>
        Replay
      </Button>
    </CatalogueSection>
  );
}
