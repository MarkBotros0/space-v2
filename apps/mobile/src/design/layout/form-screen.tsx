/**
 * A long form on a full screen: `Screen` with a `SaveBar` as its `footer`,
 * which pins the bar above the keyboard or the bottom inset and pads the
 * content by the bar's height so the last field clears it.
 */
import type { ReactNode } from "react";

import type { BackTarget } from "./large-title";
import { SaveBar } from "./save-bar";
import { Screen } from "./screen";

type FormScreenProps = {
  title: string;
  subtitle?: string;
  back?: BackTarget | null;
  saveLabel: string;
  onSave: () => void;
  saving?: boolean;
  /** Greys Save out, e.g. while nothing has changed. */
  saveDisabled?: boolean;
  saveHint?: string;
  /** Blocks Save and draws it as disabled (nothing to save); keep `saveHint` saying why. */
  disabled?: boolean;
  /** Adds pull-to-refresh, as `Screen`'s. */
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
};

export function FormScreen({
  title,
  subtitle,
  back,
  saveLabel,
  onSave,
  saving = false,
  saveDisabled = false,
  saveHint,
  disabled,
  onRefresh,
  refreshing,
  children,
}: FormScreenProps) {
  return (
    <Screen
      title={title}
      subtitle={subtitle}
      back={back}
      onRefresh={onRefresh}
      refreshing={refreshing}
      footer={
        <SaveBar
          label={saveLabel}
          onPress={onSave}
          loading={saving}
          disabled={saveDisabled || disabled}
          hint={saveHint}
        />
      }
    >
      {children}
    </Screen>
  );
}
