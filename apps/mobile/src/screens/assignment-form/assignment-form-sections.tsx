/** The assignment form's two fieldsets (refactor FE-006): its type with the forum options, and file submissions. */
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { MimeCategory } from "@space/shared";

import { cn } from "../../design/lib/cn";
import { Checkbox, FormField, Input, MultiSelect, Switch, Text } from "../../design/ui";
import type { AssignmentFormValues } from "../../lib/assignment-form-values";
import { MIME_CATEGORY_LABELS } from "../../lib/assignment-labels";

interface SectionProps {
  v: AssignmentFormValues;
  set: <K extends keyof AssignmentFormValues>(key: K, value: AssignmentFormValues[K]) => void;
  errors: Record<string, string>;
}

/** v1's `<fieldset className="rounded-lg border border-border p-4">` with its `<legend>`. */
function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <View className="flex-col gap-2 rounded-group border border-separator p-4">
      <Text className="text-sm font-medium">{legend}</Text>
      {children}
    </View>
  );
}

/** v1's `<label><input type="radio" className="size-4"/> text</label>`. */
function Radio({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="flex-row items-center gap-2"
    >
      <View
        className={cn(
          "size-4 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-control-border bg-surface",
        )}
      >
        {selected ? <View className="size-2 rounded-full bg-primary" /> : null}
      </View>
      <Text className="flex-1 text-sm">{label}</Text>
    </Pressable>
  );
}

export function AssignmentTypeSection({ v, set, errors }: SectionProps) {
  const isForum = v.type === "FORUM";
  return (
    <Fieldset legend="Type">
      <Radio
        label="Standard — students submit a private response (optional file uploads)"
        selected={!isForum}
        onPress={() => set("type", "STANDARD")}
      />
      <Radio
        label="Forum — students post a response and can see their group-mates' responses"
        selected={isForum}
        onPress={() => set("type", "FORUM")}
      />
      {isForum ? (
        <View className="mt-2 flex-col gap-4">
          <FormField
            label="Minimum words"
            description="Students must write at least this many words to post."
            error={errors.forumMinWords}
          >
            <Input
              accessibilityLabel="Minimum words"
              value={v.forumMinWords}
              onChangeText={(t) => set("forumMinWords", t)}
              keyboardType="number-pad"
            />
          </FormField>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 flex-col">
              <Text className="text-sm font-medium">Allow peer comments</Text>
              <Text className="text-sm text-muted-foreground">Let students comment on each other's responses.</Text>
            </View>
            <Switch
              accessibilityLabel="Allow peer comments"
              checked={v.forumAllowComments}
              onCheckedChange={(on) => set("forumAllowComments", on)}
            />
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 flex-col">
              <Text className="text-sm font-medium">Post before reading others</Text>
              <Text className="text-sm text-muted-foreground">
                Students see their group-mates' responses only after posting their own.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Post before reading others"
              checked={v.forumPostToRead}
              onCheckedChange={(on) => set("forumPostToRead", on)}
            />
          </View>
        </View>
      ) : null}
    </Fieldset>
  );
}

const mimeOptions = (Object.keys(MIME_CATEGORY_LABELS) as MimeCategory[]).map((c) => ({
  value: c,
  label: MIME_CATEGORY_LABELS[c],
}));

/** R25: a forum assignment never acquires file settings through the UI, so the caller shows this for Standard only. */
export function FileSubmissionsSection({ v, set, errors }: SectionProps) {
  return (
    <Fieldset legend="File submissions">
      <View className="flex-row items-center gap-2">
        <Checkbox
          accessibilityLabel="Accept file uploads"
          checked={v.acceptsFiles}
          onCheckedChange={(on) => set("acceptsFiles", on)}
        />
        <Text className="min-w-0 flex-1 text-sm">Accept file uploads from students</Text>
      </View>
      {v.acceptsFiles ? (
        <View className="mt-1 flex-col gap-4">
          <FormField label="Max file size (MB)" error={errors.maxFileSizeMb}>
            <Input
              accessibilityLabel="Max file size (MB)"
              value={v.maxFileSizeMb}
              onChangeText={(t) => set("maxFileSizeMb", t)}
              keyboardType="number-pad"
            />
          </FormField>
          <FormField label="Allowed types" error={errors.mime}>
            <MultiSelect
              accessibilityLabel="Allowed types"
              options={mimeOptions}
              value={v.allowedMimeCategories}
              onChange={(next) => set("allowedMimeCategories", next as MimeCategory[])}
              placeholder="Any type"
            />
          </FormField>
        </View>
      ) : null}
    </Fieldset>
  );
}
