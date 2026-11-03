/**
 * Counterpart of v1 src/app/dev/design-system/ (page.tsx, swatches.ts,
 * form.tsx, modal-demo.tsx, identity-demo.tsx): the same sections in the
 * same order with the same sample content, built from design/ui. Like v1's
 * page it renders outside the app shell. Hidden unless the build sets
 * EXPO_PUBLIC_SHOW_DEV_ROUTES=1.
 * Native differences: the Motion section's stagger-in animation is static.
 */
import { Redirect } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageHeader } from "../../src/design/layout/page-header";
import { showDevRoutes } from "../../src/lib/app-config";
import { ComponentSections } from "../../src/screens/design-system/component-sections";
import { FoundationSections } from "../../src/screens/design-system/foundation-sections";

export default function DesignSystem() {
  if (!showDevRoutes()) return <Redirect href="/" />;
  return <Showcase />;
}

function Showcase() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-full px-4 py-6">
        <PageHeader
          title="Design System"
          description="Tokens, primitives, and patterns. Reference before building any new screen."
        />

        <FoundationSections />
        <ComponentSections />
      </View>
    </ScrollView>
  );
}
