import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import type {
  AssignmentWriteBody,
  MimeCategory,
  SessionListItem,
} from "@space/shared";

import { FormScreen } from "../design/layout/form-screen";
import { cn } from "../design/lib/cn";
import {
  Checkbox,
  Combobox,
  DatePicker,
  FormField,
  Input,
  MultiSelect,
  PillButton,
  RichTextEditor,
  Switch,
  Text,
  TimePicker,
} from "../design/ui";
import {
  dateToDay,
  dayToDate,
  partsToTime,
  timeToParts,
  toAssignmentBody,
  type AssignmentFormValues,
} from "../lib/assignment-form-values";
import { MIME_CATEGORY_LABELS } from "../lib/assignment-labels";
import { firstErrorByField } from "../lib/form-errors";
import { formatDayKey } from "../lib/format";

export {
  NEW_ASSIGNMENT_VALUES,
  valuesFromDetail,
  type AssignmentFormValues,
} from "../lib/assignment-form-values";

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
function Radio({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
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

/** Which control each schema issue lands on; anything else goes to the bar. */
const FIELD_OF_ISSUE: Record<string, string> = {
  title: "title",
  description: "description",
  dueDay: "due",
  dueTime: "due",
  sessionId: "session",
  forumMinWords: "forumMinWords",
  maxFileSizeMb: "maxFileSizeMb",
  allowedMimeCategories: "mime",
};

export interface AssignmentFormProps {
  title: string;
  subtitle?: string;
  initial: AssignmentFormValues;
  sessions: SessionListItem[];
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (body: AssignmentWriteBody) => void;
}

export function AssignmentForm({
  title,
  subtitle,
  initial,
  sessions,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
}: AssignmentFormProps) {
  const [v, setV] = useState<AssignmentFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof AssignmentFormValues>(key: K, value: AssignmentFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const isForum = v.type === "FORUM";

  const submit = () => {
    const parsed = toAssignmentBody(v);
    if (!parsed.success) {
      const byIssue = firstErrorByField(parsed.error);
      const next: Record<string, string> = {};
      for (const [key, message] of Object.entries(byIssue)) {
        const field = FIELD_OF_ISSUE[key] ?? "form";
        if (!(field in next)) next[field] = message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  const sessionOptions = sessions.map((s) => ({
    value: String(s.id),
    label: s.title,
    // The server's org-calendar day (X13), not startsAt in the device zone.
    description: formatDayKey(s.dayKey),
  }));
  const mimeOptions = (Object.keys(MIME_CATEGORY_LABELS) as MimeCategory[]).map((c) => ({
    value: c,
    label: MIME_CATEGORY_LABELS[c],
  }));

  const saveHint =
    serverError ??
    errors.form ??
    (Object.keys(errors).length > 0 ? "Fix the fields marked above." : undefined);

  return (
    <FormScreen
      title={title}
      subtitle={subtitle}
      saveLabel={submitLabel}
      saving={submitting}
      saveHint={saveHint}
      onSave={submit}
    >
      <View className="flex-col gap-4">
        <FormField label="Title" required error={errors.title}>
          <Input
            accessibilityLabel="Title"
            value={v.title}
            onChangeText={(t) => set("title", t)}
            placeholder="e.g. Week 4 reflection"
          />
        </FormField>

        <FormField label="Description" error={errors.description}>
          <RichTextEditor
            value={v.description}
            onChange={(html) => set("description", html)}
            placeholder="Instructions, prompts, expectations…"
          />
        </FormField>

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
                  <Text className="text-sm text-muted-foreground">
                    Let students comment on each other's responses.
                  </Text>
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

        <FormField label="Due date" error={errors.due}>
          <DatePicker
            accessibilityLabel="Due date"
            value={dayToDate(v.dueDay)}
            onChange={(d) => set("dueDay", dateToDay(d))}
          />
          {v.dueDay !== null ? (
            // V2-only (R19/C2): v1 could not unset a due date once picked.
            <PillButton label="Clear due date" className="self-start" onPress={() => set("dueDay", null)} />
          ) : null}
        </FormField>
        <FormField
          label="Due time"
          description="Times are on the organisation's clock, the same for every student."
        >
          <TimePicker
            minuteStep={15}
            value={timeToParts(v.dueTime)}
            onChange={(parts) => set("dueTime", partsToTime(parts))}
          />
        </FormField>

        <FormField
          label="Linked session"
          description="Optional — associate this assignment with a session on the calendar."
          error={errors.session}
        >
          <Combobox
            accessibilityLabel="Linked session"
            options={sessionOptions}
            value={v.sessionId === null ? null : String(v.sessionId)}
            onChange={(id) => set("sessionId", id === null ? null : Number(id))}
            placeholder="No session"
            emptyMessage="No sessions for this season."
          />
        </FormField>

        {/* R25: a forum assignment never acquires file settings through the UI. */}
        {!isForum ? (
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
        ) : null}
      </View>
    </FormScreen>
  );
}
