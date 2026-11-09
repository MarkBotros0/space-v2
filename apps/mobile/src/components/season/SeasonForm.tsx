import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { seasonWriteRequestSchema, type SeasonStatus } from "@space/shared";

import { FormSection } from "../../design/forms/form-section";
import { FormScreen } from "../../design/layout/form-screen";
import { SegmentedControl, Textarea } from "../../design/ui";
import { FormField } from "../../design/ui/form-field";
import { useSeasons } from "../../hooks/use-seasons";
import { firstErrorByField } from "../../lib/form-errors";
import { autoSeasonCode } from "../../lib/season-defaults";
import { useSessionStore } from "../../store/session";
import type { SeasonIdentityInput } from "../../hooks/use-season-writes";
import {
  allowedSeasonStatuses,
  requiredProgramChoices,
  STATUS_LABELS,
  toBody,
  type SeasonFormValues,
} from "./season-form-model";
import { AttendanceSection, DatesSection, IdentitySection, TakingPartSection } from "./season-form-sections";

export {
  allowedSeasonStatuses,
  dayToDate,
  NEW_SEASON_VALUES,
  requiredProgramChoices,
  type SeasonFormValues,
} from "./season-form-model";

/**
 * Create and edit a season (v1 season-form.tsx, B5-4), as a few titled cards
 * instead of one long column (owner, 2026-11-07): Program and year (the code
 * follows them until changed by hand), Dates, Who takes part, About,
 * Attendance rules, and Status only where there is a choice (a finished season
 * is archived or restored; starting and ending are their own flows).
 * Validation is the server's own schema (spec 02 §8), so a client error and a
 * 400 cannot disagree.
 */
export function SeasonForm({
  mode,
  title,
  subtitle,
  initial,
  submitting,
  message,
  onSubmit,
  children,
}: {
  mode: "create" | "edit";
  title: string;
  subtitle?: string;
  initial: SeasonFormValues;
  submitting: boolean;
  message: string | null;
  onSubmit: (body: SeasonIdentityInput) => void;
  /** Extra content under the fields (the edit screen's delete action). */
  children?: ReactNode;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The "Fix the fields" hint belongs to the values that failed; any edit makes a new object.
  const [failedValues, setFailedValues] = useState<typeof initial | null>(null);
  // v1: an edit never auto-fills the code.
  const [codeTouched, setCodeTouched] = useState(mode === "edit" || initial.code !== "");

  // A new season is a draft: no season skips Start. An existing one only moves where the server allows.
  const statusChoices = allowedSeasonStatuses(mode === "create" ? "DRAFT" : initial.status);
  // Who may join is settled before the season starts.
  const canSetRequired = mode === "create" || initial.status === "DRAFT";
  const seasons = useSeasons(canSetRequired);
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const seasonFinished = initial.status === "COMPLETED" || initial.status === "ARCHIVED";
  const canSetGraduating = isSuper && !seasonFinished;
  const canSetCommunity = isSuper && canSetRequired;
  const requiredChoices = requiredProgramChoices(seasons.data ?? [], v.program, initial.requiredProgram);

  const patch = (next: Partial<SeasonFormValues>) => {
    setV((cur) => {
      const merged = { ...cur, ...next };
      if (!codeTouched && ("program" in next || "year" in next)) {
        merged.code = autoSeasonCode(merged.program, merged.year);
      }
      return merged;
    });
  };

  const submit = () => {
    const body = toBody(v, canSetRequired, canSetGraduating, canSetCommunity);
    const parsed = seasonWriteRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      setFailedValues(v);
      return;
    }
    setErrors({});
    onSubmit(body);
  };

  return (
    <FormScreen
      title={title}
      subtitle={subtitle}
      saveLabel={mode === "create" ? "Create season" : "Save changes"}
      saving={submitting}
      saveHint={
        message ?? (Object.keys(errors).length > 0 && failedValues === v ? "Fix the fields marked above." : undefined)
      }
      onSave={submit}
    >
      <View className="flex-col gap-6">
        <IdentitySection
          v={v}
          errors={errors}
          patch={patch}
          onCode={(code) => {
            setCodeTouched(true);
            patch({ code });
          }}
        />
        <DatesSection v={v} errors={errors} patch={patch} />
        <TakingPartSection
          v={v}
          errors={errors}
          patch={patch}
          canSetRequired={canSetRequired}
          requiredChoices={requiredChoices}
          savedRequired={initial.requiredProgram}
          graduating={canSetGraduating ? "edit" : isSuper ? "locked" : "hidden"}
          communityWide={canSetCommunity ? "edit" : isSuper ? "locked" : "hidden"}
        />
        <FormSection title="About">
          <FormField label="Description" error={errors.description}>
            <Textarea
              accessibilityLabel="Description"
              value={v.description}
              onChangeText={(description) => patch({ description })}
              placeholder="Optional. Shown on the season's page."
            />
          </FormField>
        </FormSection>
        <AttendanceSection v={v} errors={errors} patch={patch} />
        {statusChoices.length > 1 ? (
          <FormSection
            title="Status"
            note="Archived seasons are kept, out of the way. Restore one by choosing Completed."
          >
            <SegmentedControl
              options={statusChoices.map((st) => ({ value: st, label: STATUS_LABELS[st] }))}
              value={v.status}
              onChange={(status) => patch({ status: status as SeasonStatus })}
            />
          </FormSection>
        ) : null}
        {children}
      </View>
    </FormScreen>
  );
}
