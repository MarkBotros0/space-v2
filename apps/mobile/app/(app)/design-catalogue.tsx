/**
 * Hidden design catalogue: every redesign component in every state, for the
 * UI sweep (flow s90) and for looking at. Only in a dev bundle or a build
 * made with EXPO_PUBLIC_SWEEP_BUILD=1; otherwise "Not available". Fake data,
 * no network, nothing is saved. A detail route, not a nav destination.
 */
import { useState } from "react";

import { EmptyState } from "../../src/design/ui/empty-state";
import { Screen } from "../../src/design/layout/screen";
import { isSweepBuild } from "../../src/lib/app-config";
import { LeaderSection } from "../../src/screens/design-catalogue/leader-section";
import { ChipsSection } from "../../src/screens/design-catalogue/chips-section";
import {
  ControlsSection,
  HeroStatsSections,
  ListSection,
} from "../../src/screens/design-catalogue/list-cards-sections";
import {
  CatalogueSaveBar,
  SaveBarSection,
} from "../../src/screens/design-catalogue/save-bar-section";
import {
  CheckInSuccessSection,
  SheetSection,
  StatesSection,
  ToastSection,
} from "../../src/screens/design-catalogue/states-sheet-sections";
import { ButtonsSection, TypeSection } from "../../src/screens/design-catalogue/type-buttons-sections";

export default function DesignCatalogue() {
  const [saveBar, setSaveBar] = useState(false);
  if (!__DEV__ && !isSweepBuild()) {
    return (
      <Screen title="Design catalogue">
        <EmptyState title="Not available" />
      </Screen>
    );
  }
  return (
    <Screen
      title="Design catalogue"
      subtitle="Every component in every state."
      footer={saveBar ? <CatalogueSaveBar onDone={() => setSaveBar(false)} /> : undefined}
    >
      <TypeSection />
      <ButtonsSection />
      <ChipsSection />
      <ListSection />
      <HeroStatsSections />
      <ControlsSection />
      <StatesSection />
      <CheckInSuccessSection />
      <ToastSection />
      <SheetSection />
      <SaveBarSection shown={saveBar} onToggle={() => setSaveBar((on) => !on)} />
      <LeaderSection />
    </Screen>
  );
}
