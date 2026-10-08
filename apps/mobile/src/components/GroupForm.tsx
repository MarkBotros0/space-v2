import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { groupWriteRequestSchema } from "@space/shared";

import { useLeaderOptions, useSeasonRoster, type GroupWriteInput } from "../hooks/use-group-admin";
import { firstErrorByField } from "../lib/form-errors";
import { useTheme } from "../theme";
import { Button, Card, ErrorState, Input, LoadingState, Text } from "../ui";

export interface GroupFormValues {
  name: string;
  description: string;
  leaderIds: number[];
  studentIds: number[];
}

const toggle = (ids: number[], id: number) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

function CheckRow({ label, caption, checked, onPress }: { label: string; caption?: string | null; checked: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onPress}>
      <View style={{ paddingVertical: theme.spacing.xs }}>
        <Text variant="body">{`${checked ? "☑" : "☐"} ${label}`}</Text>
        {caption ? <Text variant="caption" color={theme.colors.neutral[600]}>{caption}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * Create/edit a group (v1 group-form.tsx; spec 05 §9). Students are picked
 * from the season ROSTER (ACTIVE enrolments, C9), never the global student
 * table. The server validates leaders are LEADERs and students are enrolled
 * (Plan 2's validateGroupWrite) and returns name_taken / invalid_leader /
 * not_enrolled, shown verbatim via `message`. Saving REPLACES the group's
 * leader and student lists (spec 05 R30) — the form says so.
 */
export function GroupForm({
  seasonId,
  groupId,
  initial,
  submitLabel,
  submitting,
  message,
  onSubmit,
}: {
  seasonId: number;
  groupId: number | null;
  initial: GroupFormValues;
  submitLabel: string;
  submitting: boolean;
  message: string | null;
  onSubmit: (body: GroupWriteInput) => void;
}) {
  const theme = useTheme();
  const leaders = useLeaderOptions(true);
  const roster = useSeasonRoster(seasonId);
  const [values, setValues] = useState(initial);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const body: GroupWriteInput = {
      name: values.name.trim(),
      description: values.description.trim() === "" ? null : values.description,
      leaderIds: values.leaderIds,
      studentIds: values.studentIds,
    };
    const parsed = groupWriteRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    onSubmit(body);
  };

  let leaderList: ReactNode;
  if (leaders.isPending) leaderList = <LoadingState />;
  else if (leaders.isError) leaderList = <ErrorState message="Couldn't load leaders." onRetry={() => void leaders.refetch()} />;
  else
    leaderList = leaders.data.map((l) => (
      <CheckRow
        key={l.id}
        label={l.name ?? l.email}
        checked={values.leaderIds.includes(l.id)}
        onPress={() => setValues({ ...values, leaderIds: toggle(values.leaderIds, l.id) })}
      />
    ));

  const q = query.trim().toLowerCase();
  let studentList: ReactNode;
  if (roster.isPending) studentList = <LoadingState />;
  else if (roster.isError) studentList = <ErrorState message="Couldn't load the roster." onRetry={() => void roster.refetch()} />;
  else
    studentList = roster.data
      .filter((r) => q === "" || (r.name ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .map((r) => {
        const caption =
          r.groupId !== null && r.groupId !== groupId
            ? `Now in ${r.groupName ?? "another group"} — saving moves them here.`
            : r.groupId === null && r.otherSeasonGroup
              ? `In ${r.otherSeasonGroup.groupName} (${r.otherSeasonGroup.seasonCode}) — that stays as it is; saving adds them here.`
              : null;
        return (
          <CheckRow
            key={r.userId}
            label={r.name ?? r.email}
            caption={caption}
            checked={values.studentIds.includes(r.userId)}
            onPress={() => setValues({ ...values, studentIds: toggle(values.studentIds, r.userId) })}
          />
        );
      });

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Input label="Name" value={values.name} onChangeText={(name) => setValues({ ...values, name })} error={errors.name} />
      <Input
        label="Description"
        value={values.description}
        onChangeText={(description) => setValues({ ...values, description })}
        multiline
        error={errors.description}
      />
      <Text variant="heading">Leaders</Text>
      {leaderList}
      <Text variant="heading">Students</Text>
      <Input label="Search students" value={query} onChangeText={setQuery} autoCapitalize="none" />
      {studentList}
      <Text variant="caption" color={theme.colors.neutral[600]}>
        Saving replaces this group's leaders and its student list.
      </Text>
      {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
      <Button title={submitLabel} onPress={submit} loading={submitting} />
    </Card>
  );
}
