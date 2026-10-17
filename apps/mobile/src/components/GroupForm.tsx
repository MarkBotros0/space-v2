import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { groupWriteRequestSchema } from "@space/shared";

import { FormActions, FormErrorBox } from "../design/forms/form-parts";
import { FormField, Input, MultiSelect, Textarea } from "../design/ui";
import { useLeaderOptions, useSeasonRoster, type GroupWriteInput } from "../hooks/use-group-admin";
import { firstErrorByField } from "../lib/form-errors";

export interface GroupFormValues {
  name: string;
  description: string;
  leaderIds: number[];
  studentIds: number[];
}

/**
 * Create/edit a group (v1 group-form.tsx: Name, Description, Leaders and
 * Students as MultiSelects, error box, Cancel + submit; spec 05 §9). Students
 * are picked from the season ROSTER (ACTIVE enrolments, C9), never the global
 * student table. The server validates leaders are LEADERs and students are
 * enrolled (Plan 2's validateGroupWrite) and returns name_taken /
 * invalid_leader / not_enrolled, shown verbatim via `message`. Saving
 * REPLACES the group's leader and student lists (spec 05 R30) — the form says
 * so (V2-ONLY hints on students who are in another group).
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
  const router = useRouter();
  const leaders = useLeaderOptions(true);
  const roster = useSeasonRoster(seasonId);
  const [values, setValues] = useState(initial);
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

  const leaderOptions = (leaders.data ?? []).map((l) => ({
    value: String(l.id),
    label: l.name ?? l.email,
    description: l.email,
  }));
  const studentOptions = (roster.data ?? []).map((r) => {
    const hint =
      r.groupId !== null && r.groupId !== groupId
        ? `Now in ${r.groupName ?? "another group"} — saving moves them here.`
        : r.groupId === null && r.otherSeasonGroup
          ? `In ${r.otherSeasonGroup.groupName} (${r.otherSeasonGroup.seasonCode}) — saving moves them here.`
          : null;
    return {
      value: String(r.userId),
      label: r.name ?? r.email,
      description: hint ? `${r.email} · ${hint}` : r.email,
    };
  });

  return (
    <View className="flex-col gap-4">
      <FormField label="Name" required error={errors.name}>
        <Input
          accessibilityLabel="Name"
          value={values.name}
          onChangeText={(name) => setValues({ ...values, name })}
          placeholder="e.g. Alpha"
        />
      </FormField>

      <FormField label="Description" error={errors.description}>
        <Textarea
          accessibilityLabel="Description"
          value={values.description}
          onChangeText={(description) => setValues({ ...values, description })}
          placeholder="Optional context shown on the group page."
        />
      </FormField>

      <FormField
        label="Leaders"
        description="Choose one or more leaders for this group."
        error={errors.leaderIds}
      >
        <MultiSelect
          accessibilityLabel="Leaders"
          options={leaderOptions}
          value={values.leaderIds.map(String)}
          onChange={(ids) => setValues({ ...values, leaderIds: ids.map(Number) })}
          placeholder={
            leaders.isPending
              ? "Loading…"
              : leaders.isError
                ? "Couldn't load leaders."
                : "Pick leaders…"
          }
          emptyMessage="No leaders found."
        />
      </FormField>

      <FormField
        label="Students"
        description="Students enrolled in this group for the current season. Adding a student here will move them out of any other group. Saving replaces this group's leaders and its student list."
        error={errors.studentIds}
      >
        <MultiSelect
          accessibilityLabel="Students"
          options={studentOptions}
          value={values.studentIds.map(String)}
          onChange={(ids) => setValues({ ...values, studentIds: ids.map(Number) })}
          placeholder={
            roster.isPending
              ? "Loading…"
              : roster.isError
                ? "Couldn't load the roster."
                : "Pick students…"
          }
          emptyMessage="No students found."
        />
      </FormField>

      <FormErrorBox message={message} />
      <FormActions
        submitLabel={submitLabel}
        pending={submitting}
        onSubmit={submit}
        onCancel={() => router.back()}
      />
    </View>
  );
}
