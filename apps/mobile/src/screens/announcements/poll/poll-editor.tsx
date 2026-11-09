import { View } from "react-native";
import { POLL_OPTION_MAX, POLL_OPTIONS_MAX, POLL_OPTIONS_MIN, type PollInput } from "@space/shared";

import { FormField } from "../../../design/ui/form-field";
import { Input } from "../../../design/ui/input";
import { PillButton } from "../../../design/ui/pill-button";
import { Switch } from "../../../design/ui/switch";
import { Text } from "../../../design/ui/text";

export const EMPTY_POLL: PollInput = { allowsMultiple: false, options: [{ label: "" }, { label: "" }] };

/** Option errors keyed by index, and `options` for the count. */
export type PollErrors = Record<number, string> & { options?: string };

/** Poll errors from the shared schema's issues (paths under `poll`), as the words the editor shows. */
export function pollErrors(issues: { path: PropertyKey[]; message: string }[]): PollErrors {
  const out: PollErrors = {};
  for (const issue of issues) {
    if (issue.path[0] !== "poll" || issue.path[1] !== "options") continue;
    const index = issue.path[2];
    if (typeof index === "number") {
      out[index] ??=
        issue.message === "Each option must be different"
          ? "Two options say the same thing."
          : `Enter this option (up to ${POLL_OPTION_MAX} characters).`;
    } else out.options ??= "Add at least two options.";
  }
  return out;
}

/** The poll section of the composer: its options, whether people may pick several, and Remove poll. */
export function PollEditor({
  value,
  onChange,
  errors,
  onRemove,
}: {
  value: PollInput;
  onChange: (v: PollInput) => void;
  errors: PollErrors;
  /** Remove poll: the form drops the whole poll. */
  onRemove: () => void;
}) {
  const options = value.options;
  const setLabel = (i: number, label: string) =>
    onChange({ ...value, options: options.map((o, j) => (j === i ? { ...o, label } : o)) });
  const remove = (i: number) => onChange({ ...value, options: options.filter((_, j) => j !== i) });
  const add = () => onChange({ ...value, options: [...options, { label: "" }] });

  return (
    <View className="flex-col gap-3">
      <Text variant="headline" className="text-foreground">
        Poll
      </Text>
      {options.map((option, i) => (
        <View key={i} className="flex-row items-start gap-2">
          <View className="min-w-0 flex-1">
            <FormField error={errors[i]}>
              <Input
                accessibilityLabel={`Option ${i + 1}`}
                value={option.label}
                maxLength={POLL_OPTION_MAX}
                onChangeText={(t) => setLabel(i, t)}
              />
            </FormField>
          </View>
          {options.length > POLL_OPTIONS_MIN ? (
            <PillButton
              label="Remove"
              accessibilityLabel={`Remove option ${i + 1}`}
              onPress={() => remove(i)}
              className="mt-2"
            />
          ) : null}
        </View>
      ))}
      {errors.options ? (
        <Text variant="subhead" className="text-bad">
          {errors.options}
        </Text>
      ) : null}
      {options.length < POLL_OPTIONS_MAX ? (
        <PillButton label="Add option" onPress={add} className="self-start" />
      ) : null}
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="body" className="min-w-0 flex-1 text-foreground">
          Let people pick more than one
        </Text>
        <Switch
          accessibilityLabel="Let people pick more than one"
          checked={value.allowsMultiple}
          onCheckedChange={(allowsMultiple) => onChange({ ...value, allowsMultiple })}
        />
      </View>
      <PillButton destructive label="Remove poll" onPress={onRemove} className="self-start" />
    </View>
  );
}
