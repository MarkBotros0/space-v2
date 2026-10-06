import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import {
  assignmentWriteRequestSchema,
  type AssignmentDetail,
  type AssignmentTrackerRow,
  type AssignmentWriteBody,
  type GroupListItem,
  type MimeCategory,
  type SessionListItem,
} from "@space/shared";

import { MIME_CATEGORY_LABELS } from "../lib/assignment-labels";
import { formatDayKey } from "../lib/format";
import { useTheme } from "../theme";
import { Button, Card, Input, Text } from "../ui";
import { DueDateField } from "./due-date-field";

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
      !isForum && v.acceptsFiles ? (v.maxFileSizeMb.trim() === "" ? 10 : Number(v.maxFileSizeMb)) : null,
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

function Choice({
  label,
  selected,
  onPress,
  role,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role: "radio" | "checkbox";
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radii.sm,
        borderWidth: theme.borderWidths.thin,
        borderColor: selected ? theme.colors.brand.navy[900] : theme.colors.neutral[300],
        backgroundColor: selected ? theme.colors.brand.teal[500] : theme.colors.transparent,
      }}
    >
      <Text variant="label">{label}</Text>
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
  const theme = useTheme();
  const [v, setV] = useState<AssignmentFormValues>(initial);
  const [clientError, setClientError] = useState<string | null>(null);

  const set = <K extends keyof AssignmentFormValues>(key: K, value: AssignmentFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

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

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Input label="Title" value={v.title} onChangeText={(t) => set("title", t)} />
      <Input
        label="Description"
        value={v.description}
        onChangeText={(t) => set("description", t)}
        multiline
        numberOfLines={6}
      />

      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Type</Text>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <Choice role="radio" label="Standard" selected={!isForum} onPress={() => set("type", "STANDARD")} />
          <Choice role="radio" label="Forum" selected={isForum} onPress={() => set("type", "FORUM")} />
        </View>
        {isForum ? (
          <>
            <Input
              label="Minimum words"
              value={v.forumMinWords}
              onChangeText={(t) => set("forumMinWords", t)}
              keyboardType="number-pad"
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="body">Allow peer comments</Text>
              <Switch
                accessibilityLabel="Allow peer comments"
                value={v.forumAllowComments}
                onValueChange={(on) => set("forumAllowComments", on)}
              />
            </View>
          </>
        ) : null}
      </Card>

      <Card>
        <DueDateField
          value={{ day: v.dueDay, time: v.dueTime }}
          onChange={(next) => setV((prev) => ({ ...prev, dueDay: next.day, dueTime: next.time }))}
        />
      </Card>

      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Linked session</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <Choice role="radio" label="No session" selected={v.sessionId === null} onPress={() => set("sessionId", null)} />
          {sessions.map((s) => (
            <Choice
              key={s.id}
              role="radio"
              // The server's org-calendar day (X13), not startsAt in the device zone.
              label={`${s.title} · ${formatDayKey(s.dayKey)}`}
              selected={v.sessionId === s.id}
              onPress={() => set("sessionId", s.id)}
            />
          ))}
        </View>
      </Card>

      {/* R25: a forum assignment never acquires file settings through the UI. */}
      {!isForum ? (
        <Card style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="heading">Accept file uploads</Text>
            <Switch
              accessibilityLabel="Accept file uploads"
              value={v.acceptsFiles}
              onValueChange={(on) => set("acceptsFiles", on)}
            />
          </View>
          {v.acceptsFiles ? (
            <>
              <Input
                label="Max file size (MB)"
                value={v.maxFileSizeMb}
                onChangeText={(t) => set("maxFileSizeMb", t)}
                keyboardType="number-pad"
              />
              <Text variant="label">Allowed types (none ticked = any type)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {(Object.keys(MIME_CATEGORY_LABELS) as MimeCategory[]).map((c) => (
                  <Choice
                    key={c}
                    role="checkbox"
                    label={MIME_CATEGORY_LABELS[c]}
                    selected={v.allowedMimeCategories.includes(c)}
                    onPress={() => set("allowedMimeCategories", toggle(v.allowedMimeCategories, c))}
                  />
                ))}
              </View>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Assign to</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <Choice
            role="radio"
            label="All students in this season"
            selected={v.targetMode === "all"}
            onPress={() => set("targetMode", "all")}
          />
          <Choice
            role="radio"
            label="Specific groups"
            selected={v.targetMode === "groups"}
            onPress={() => set("targetMode", "groups")}
          />
        </View>
        {v.targetMode === "groups" ? (
          groups.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>
              This season has no groups yet.
            </Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {groups.map((g) => (
                <Choice
                  key={g.id}
                  role="checkbox"
                  label={g.name}
                  selected={v.groupIds.includes(g.id)}
                  onPress={() => set("groupIds", toggle(v.groupIds, g.id))}
                />
              ))}
            </View>
          )
        ) : null}
      </Card>

      {orphaned > 0 ? (
        <Text variant="body" color={theme.colors.warning[700]}>
          {`${orphaned} student${orphaned === 1 ? "" : "s"} in groups you removed ${
            orphaned === 1 ? "has" : "have"
          } already started or submitted work. They will no longer see this assignment; their work is kept.`}
        </Text>
      ) : null}

      {error ? (
        <Text variant="body" color={theme.colors.error[600]}>
          {error}
        </Text>
      ) : null}
      <Button title={submitLabel} onPress={submit} loading={submitting} />
    </View>
  );
}
