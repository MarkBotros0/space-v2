import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import type {
  AssignmentTrackerRow,
  AssignmentWriteBody,
  GroupListItem,
  MimeCategory,
  SessionListItem,
} from "@space/shared";

import { FormActions, FormErrorBox } from "../design/forms/form-parts";
import { cn } from "../design/lib/cn";
import {
  Checkbox,
  Combobox,
  DatePicker,
  FormField,
  Input,
  MultiSelect,
  RichTextEditor,
  Switch,
  Text,
  TimePicker,
} from "../design/ui";
import {
  dateToDay,
  dayToDate,
  orphanedWorkCount,
  partsToTime,
  timeToParts,
  toAssignmentBody,
  type AssignmentFormValues,
} from "../lib/assignment-form-values";
import { MIME_CATEGORY_LABELS } from "../lib/assignment-labels";
import { formatDayKey } from "../lib/format";

export {
  NEW_ASSIGNMENT_VALUES,
  valuesFromDetail,
  type AssignmentFormValues,
} from "../lib/assignment-form-values";

/** v1's `<fieldset className="rounded-lg border border-border p-4">` with its `<legend>`. */
function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <View className="flex-col gap-2 rounded-lg border border-border p-4">
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
          selected ? "border-primary" : "border-input bg-background",
        )}
      >
        {selected ? <View className="size-2 rounded-full bg-primary" /> : null}
      </View>
      <Text className="flex-1 text-sm">{label}</Text>
    </Pressable>
  );
}

export interface AssignmentFormProps {
  initial: AssignmentFormValues;
  groups: GroupListItem[];
  sessions: SessionListItem[];
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  /** Edit only: the tracker's rows, for the narrowing warning. */
  trackerRows?: AssignmentTrackerRow[];
  onSubmit: (body: AssignmentWriteBody) => void;
}

export function AssignmentForm({
  initial,
  groups,
  sessions,
  submitLabel,
  submitting,
  serverError,
  trackerRows,
  onSubmit,
}: AssignmentFormProps) {
  const router = useRouter();
  const [v, setV] = useState<AssignmentFormValues>(initial);
  const [clientError, setClientError] = useState<string | null>(null);

  const set = <K extends keyof AssignmentFormValues>(key: K, value: AssignmentFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const isForum = v.type === "FORUM";
  const orphaned = trackerRows ? orphanedWorkCount(trackerRows, v) : 0;
  const error = clientError ?? serverError;

  const submit = () => {
    const parsed = toAssignmentBody(v);
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setClientError(null);
    onSubmit(parsed.data);
  };

  const sessionOptions = sessions.map((s) => ({
    value: String(s.id),
    label: s.title,
    // The server's org-calendar day (X13), not startsAt in the device zone.
    description: formatDayKey(s.dayKey),
  }));
  const groupOptions = groups.map((g) => ({ value: String(g.id), label: g.name }));
  const mimeOptions = (Object.keys(MIME_CATEGORY_LABELS) as MimeCategory[]).map((c) => ({
    value: c,
    label: MIME_CATEGORY_LABELS[c],
  }));

  return (
    <View className="flex-col gap-4">
      <FormField label="Title" required>
        <Input
          accessibilityLabel="Title"
          value={v.title}
          onChangeText={(t) => set("title", t)}
          placeholder="e.g. Week 4 reflection"
        />
      </FormField>

      <FormField label="Description">
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
          </View>
        ) : null}
      </Fieldset>

      <FormField label="Due date">
        <DatePicker
          accessibilityLabel="Due date"
          value={dayToDate(v.dueDay)}
          onChange={(d) => set("dueDay", dateToDay(d))}
        />
        {v.dueDay !== null ? (
          // V2-only (R19/C2): v1 could not unset a due date once picked.
          <Pressable
            accessibilityRole="button"
            className="self-start"
            onPress={() => set("dueDay", null)}
          >
            <Text className="text-sm text-muted-foreground underline">Clear due date</Text>
          </Pressable>
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
            <Text className="text-sm">Accept file uploads from students</Text>
          </View>
          {v.acceptsFiles ? (
            <View className="mt-1 flex-col gap-4">
              <FormField label="Max file size (MB)">
                <Input
                  accessibilityLabel="Max file size (MB)"
                  value={v.maxFileSizeMb}
                  onChangeText={(t) => set("maxFileSizeMb", t)}
                  keyboardType="number-pad"
                />
              </FormField>
              <FormField label="Allowed types">
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

      <Fieldset legend="Assign to">
        <Radio
          label="All students in this season"
          selected={v.targetMode === "all"}
          onPress={() => set("targetMode", "all")}
        />
        <Radio
          label="Specific groups"
          selected={v.targetMode === "groups"}
          onPress={() => set("targetMode", "groups")}
        />
        {v.targetMode === "groups" ? (
          <View className="mt-1">
            <FormField label="Groups">
              <MultiSelect
                accessibilityLabel="Groups"
                options={groupOptions}
                value={v.groupIds.map(String)}
                onChange={(ids) => set("groupIds", ids.map(Number))}
                placeholder="Pick groups…"
                emptyMessage="This season has no groups yet."
              />
            </FormField>
          </View>
        ) : null}
      </Fieldset>

      {orphaned > 0 ? (
        <Text className="text-sm text-warning-700 dark:text-warning-300">
          {`${orphaned} student${orphaned === 1 ? "" : "s"} in groups you removed ${
            orphaned === 1 ? "has" : "have"
          } already started or submitted work. They will no longer see this assignment; their work is kept.`}
        </Text>
      ) : null}

      <FormErrorBox message={error} />
      <FormActions
        submitLabel={submitLabel}
        pending={submitting}
        onSubmit={submit}
        onCancel={() => router.back()}
      />
    </View>
  );
}
