import { useState, type ReactNode } from "react";
import { format, isValid, parse } from "date-fns";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  assignmentWriteRequestSchema,
  type AssignmentDetail,
  type AssignmentTrackerRow,
  type AssignmentWriteBody,
  type GroupListItem,
  type MimeCategory,
  type SessionListItem,
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
import { MIME_CATEGORY_LABELS } from "../lib/assignment-labels";
import { formatDayKey } from "../lib/format";

/** Form state — strings for the numeric inputs, as typed. */
export interface AssignmentFormValues {
  title: string;
  description: string;
  dueDay: string | null;
  dueTime: string;
  sessionId: number | null;
  type: "STANDARD" | "FORUM";
  forumMinWords: string;
  forumAllowComments: boolean;
  acceptsFiles: boolean;
  maxFileSizeMb: string;
  allowedMimeCategories: MimeCategory[];
  targetMode: "all" | "groups";
  groupIds: number[];
}

/** v1's defaults (`assignment-form.tsx:109-126`): 23:59, 50 words, 10 MB, whole season (R19, R21–R23). */
export const NEW_ASSIGNMENT_VALUES: AssignmentFormValues = {
  title: "",
  description: "",
  dueDay: null,
  dueTime: "23:59",
  sessionId: null,
  type: "STANDARD",
  forumMinWords: "50",
  forumAllowComments: false,
  acceptsFiles: false,
  maxFileSizeMb: "10",
  allowedMimeCategories: [],
  targetMode: "all",
  groupIds: [],
};

/** Edit pre-fill — from the server's org-clock fields, never from dueAt (C2). */
export function valuesFromDetail(d: AssignmentDetail): AssignmentFormValues {
  return {
    title: d.title,
    description: d.description ?? "",
    dueDay: d.dueOrgDay,
    dueTime: d.dueOrgTime ?? "23:59",
    sessionId: d.sessionId,
    type: d.type,
    forumMinWords: String(d.forumMinWords ?? 50),
    forumAllowComments: d.forumAllowComments,
    // R10: no separate flag — a size means "accepts files".
    acceptsFiles: d.maxFileSizeMb !== null,
    maxFileSizeMb: String(d.maxFileSizeMb ?? 10),
    allowedMimeCategories: d.allowedMimeCategories,
    targetMode: d.isAllGroups ? "all" : "groups",
    groupIds: d.groupIds ?? [],
  };
}

/**
 * v1's payload assembly (`assignment-form.tsx:133-158`) — forum words fall
 * back to 0 when cleared (R21), size to 10 (R22), picked groups are dropped
 * when targeting everyone (R24) — then validated with the SAME schema the
 * server uses, so the two cannot disagree (R18 was exactly that disagreement).
 */
export function toAssignmentBody(v: AssignmentFormValues) {
  const isForum = v.type === "FORUM";
  return assignmentWriteRequestSchema.safeParse({
    title: v.title.trim(),
    description: v.description.trim() === "" ? null : v.description,
    dueDay: v.dueDay,
    dueTime: v.dueDay === null ? null : v.dueTime,
    sessionId: v.sessionId,
    type: v.type,
    forumMinWords: isForum ? (v.forumMinWords.trim() === "" ? 0 : Number(v.forumMinWords)) : null,
    forumAllowComments: isForum ? v.forumAllowComments : false,
    maxFileSizeMb:
      !isForum && v.acceptsFiles
        ? v.maxFileSizeMb.trim() === ""
          ? 10
          : Number(v.maxFileSizeMb)
        : null,
    allowedMimeCategories: !isForum && v.acceptsFiles ? v.allowedMimeCategories : [],
    isAllGroups: v.targetMode === "all",
    groupIds: v.targetMode === "groups" ? v.groupIds : [],
  });
}

/**
 * Tracker rows (already on screen) whose student started work in a group the
 * new targeting drops. Narrowing hides the assignment from them (R73); spec
 * §10 item 5 asks the client to warn. Presentational: it counts rows the
 * screen holds; the server still accepts the edit (R72).
 */
export function orphanedWorkCount(rows: AssignmentTrackerRow[], v: AssignmentFormValues): number {
  if (v.targetMode === "all") return 0;
  return rows.filter(
    (r) => r.status !== "PENDING" && (r.groupId === null || !v.groupIds.includes(r.groupId)),
  ).length;
}

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

const dayToDate = (day: string | null): Date | null => {
  if (day === null) return null;
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
};
const timeToParts = (time: string): { hour: number; minute: number } => {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : { hour: 23, minute: 59 };
};
const pad = (n: number) => String(n).padStart(2, "0");

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
          onChange={(d) => set("dueDay", format(d, "yyyy-MM-dd"))}
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
          onChange={({ hour, minute }) => set("dueTime", `${pad(hour)}:${pad(minute)}`)}
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
