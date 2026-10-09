import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { groupWriteRequestSchema } from "@space/shared";

import { useLeaderOptions, useStudentOptions, type GroupWriteInput } from "../hooks/use-group-admin";
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

/** v1 group-form.tsx:148's helper line, verbatim (spec 05 R79). */
export const GROUP_FORM_STUDENT_HELP =
  "Students enrolled in this group for the current season. Adding a student here will move them out of any other group.";

/**
 * Create/edit a group (v1 group-form.tsx; spec 05 §9). v1 parity 2026-10-09
 * (spec 05 R18/R78/R79): students are picked from EVERY live STUDENT user, as
 * v1's listStudentsForPicker, name/email only, under v1's one static helper
 * line; saving enrols a picked student not yet in the season. The server
 * validates leaders are LEADERs and students are live students and returns
 * invalid_leader / invalid_student, shown verbatim via `message`. Saving
 * REPLACES the group's leader and student lists (spec 05 R30) — the form says so.
 */
export function GroupForm({
  initial,
  submitLabel,
  submitting,
  message,
  onSubmit,
}: {
  initial: GroupFormValues;
  submitLabel: string;
  submitting: boolean;
  message: string | null;
  onSubmit: (body: GroupWriteInput) => void;
}) {
  const theme = useTheme();
  const leaders = useLeaderOptions(true);
  const students = useStudentOptions(true);
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
  if (students.isPending) studentList = <LoadingState />;
  else if (students.isError) studentList = <ErrorState message="Couldn't load students." onRetry={() => void students.refetch()} />;
  else
    studentList = students.data
      .filter((r) => q === "" || (r.name ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .map((r) => (
        <CheckRow
          key={r.id}
          label={r.name ?? r.email}
          caption={r.name ? r.email : null}
          checked={values.studentIds.includes(r.id)}
          onPress={() => setValues({ ...values, studentIds: toggle(values.studentIds, r.id) })}
        />
      ));

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
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {GROUP_FORM_STUDENT_HELP}
      </Text>
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
