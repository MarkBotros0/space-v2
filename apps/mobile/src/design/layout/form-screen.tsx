/**
 * A long form on a full screen: `Screen` plus a `SaveBar` pinned above the
 * keyboard or the bottom inset. The bar is absolutely positioned, so it is a
 * sibling of the scroll view, and its measured height is added to the content
 * as a trailing spacer so the last field clears it.
 */
import { type ReactNode, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";

import type { BackTarget } from "./large-title";
import { SaveBar } from "./save-bar";
import { Screen } from "./screen";

export type FormScreenProps = {
  title: string;
  subtitle?: string;
  back?: BackTarget | null;
  saveLabel: string;
  onSave: () => void;
  saving?: boolean;
  saveHint?: string;
  children: ReactNode;
};

export function FormScreen({
  title,
  subtitle,
  back,
  saveLabel,
  onSave,
  saving = false,
  saveHint,
  children,
}: FormScreenProps) {
  const [barHeight, setBarHeight] = useState(0);
  const onBarLayout = (e: LayoutChangeEvent) => setBarHeight(e.nativeEvent.layout.height);
  return (
    <View className="flex-1">
      <Screen title={title} subtitle={subtitle} back={back}>
        {children}
        <View testID="form-screen-spacer" style={{ height: barHeight }} />
      </Screen>
      <SaveBar label={saveLabel} onPress={onSave} loading={saving} hint={saveHint} onLayout={onBarLayout} />
    </View>
  );
}
