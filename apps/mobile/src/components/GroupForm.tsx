import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { groupWriteRequestSchema, type GroupDetail } from "@space/shared";

import { FormScreen } from "../design/layout/form-screen";
import { FormField, Input, MultiSelect, Textarea } from "../design/ui";
import { useSeasonRoster, type GroupWriteInput } from "../hooks/use-group-admin";
import { useSeasonAdmins, useStaffCandidates } from "../hooks/use-season-admins";
import { firstErrorByField } from "../lib/form-errors";
import { useSessionStore } from "../store/session";

export interface GroupFormValues {
  name: string;
  description: string;
  leaderIds: number[];
  studentIds: number[];
}

/**
 * Create/edit a group (v1 group-form.tsx: Name, Description, Leaders and
 * Students as MultiSelects; spec 05 §9), on `FormScreen`'s pinned save bar with the server message as its hint. Students
 * are picked from the season ROSTER (ACTIVE enrolments, C9), never the global
 * student table. The server checks newly added leaders against the one-role
 * rule and students against the roster, and its refusal is shown verbatim via
 * `message`. Saving
 * REPLACES the group's leader and student lists (spec 05 R30) — the form says
 * so (V2-ONLY hints on students who are in another group).
 *
 * Leaders come from the season's staff candidates (alumni with no active
 * role), plus the group's current leaders so one can be unticked, plus the
 * season's own admins, who may lead (a SUPER reads the admins list; a season
 * admin offers themselves, the one admin they can see).
 */
export function GroupForm({
  title,
  subtitle,
  children,
  seasonId,
  groupId,
  initial,
  currentLeaders = [],
  submitLabel,
  submitting,
  message,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  /** Under the fields (the edit screen's delete section). */
  children?: ReactNode;
  seasonId: number;
  groupId: number | null;
  initial: GroupFormValues;
  /** The group's leaders now (`detail.leaders`); none when creating. */
  currentLeaders?: GroupDetail["leaders"];
  submitLabel: string;
  submitting: boolean;
  message: string | null;
  onSubmit: (body: GroupWriteInput) => void;
}) {
  const leaders = useStaffCandidates(seasonId, { enabled: true });
  const me = useSessionStore((st) => st.user);
  const scopes = useSessionStore((st) => st.scopes);
  const seasonAdmins = useSeasonAdmins(seasonId, { enabled: me?.role === "SUPER" });
  const roster = useSeasonRoster(seasonId);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The "Fix the fields" hint belongs to the values that failed; any edit makes a new object.
  const [failedValues, setFailedValues] = useState<typeof initial | null>(null);

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
      setFailedValues(values);
      return;
    }
    setErrors({});
    onSubmit(body);
  };

  const leaderOptions = leaderChoices(
    leaders.data ?? [],
    currentLeaders,
    me?.role === "SUPER"
      ? (seasonAdmins.data ?? []).map((a) => ({ id: a.userId, name: a.name }))
      : me?.role === "ADMIN" && scopes?.seasonAdminIds.includes(seasonId)
        ? [{ id: me.id, name: me.name }]
        : [],
  );
  const studentOptions = (roster.data ?? []).map((r) => {
    const hint =
      r.groupId !== null && r.groupId !== groupId
        ? `Now in ${r.groupName ?? "another group"} — saving moves them here.`
        : null;
    return {
      value: String(r.userId),
      label: r.name ?? r.email,
      description: hint ? `${r.email} · ${hint}` : r.email,
    };
  });

  const editing = groupId !== null;

  return (
    <FormScreen
      title={title}
      subtitle={subtitle}
      saveLabel={submitLabel}
      saving={submitting}
      saveHint={
        message ??
        (Object.keys(errors).length > 0 && failedValues === values
          ? "Fix the fields marked above."
          : undefined)
      }
      onSave={submit}
    >
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
          description={`Students enrolled in this group for the current season. Adding a student here will move them out of any other group.${editing ? " Saving replaces this group's leaders and its student list." : ""}`}
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

        {children}
      </View>
    </FormScreen>
  );
}

interface Choice {
  value: string;
  label: string;
  description?: string;
}

/**
 * One option per person, by name: the candidates (last season as the
 * description), this group's current leaders (so they can be unticked) and the
 * season's admins. A person in more than one list keeps the first description.
 */
function leaderChoices(
  candidates: { id: number; name: string; lastSeason: { title: string } | null }[],
  current: { id: number; name: string | null; email?: string }[],
  admins: { id: number; name: string }[],
): Choice[] {
  const byId = new Map<number, Choice>();
  const add = (id: number, label: string, description?: string) => {
    if (!byId.has(id)) byId.set(id, { value: String(id), label, description });
  };
  for (const c of candidates) add(c.id, c.name, c.lastSeason?.title);
  for (const l of current) add(l.id, l.name ?? l.email ?? "Unnamed", "Leads this group");
  for (const a of admins) add(a.id, a.name, "Season admin");
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}
