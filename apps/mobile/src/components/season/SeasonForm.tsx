import { format, isValid, parse } from "date-fns";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { seasonWriteRequestSchema, type SeasonStatus } from "@space/shared";

import { FormScreen } from "../../design/layout/form-screen";
import {
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from "../../design/ui";
import { CommunityWideField } from "./CommunityWideField";
import { GraduatingField } from "./GraduatingField";
import { FormField } from "../../design/ui/form-field";
import { useSeasons } from "../../hooks/use-seasons";
import { firstErrorByField } from "../../lib/form-errors";
import { autoSeasonCode } from "../../lib/season-defaults";
import { useSessionStore } from "../../store/session";
import type { SeasonIdentityInput } from "../../hooks/use-season-writes";

export interface SeasonFormValues {
  code: string;
  program: string;
  /** The program someone must have finished to join; "" for none. */
  requiredProgram: string;
  /** Everyone who passes becomes an alumnus when the season ends. */
  graduatesOnPass: boolean;
  /** Anyone may study, alumni too; no required program, graduates nobody. */
  isCommunityWide: boolean;
  year: string;
  description: string;
  /** Calendar days "YYYY-MM-DD" (spec 02 D12: stored as UTC midnight). */
  startDay: string;
  endDay: string;
  status: SeasonStatus;
  budget: string;
  weight: string;
}

export const NEW_SEASON_VALUES: SeasonFormValues = {
  code: "",
  program: "",
  requiredProgram: "",
  graduatesOnPass: false,
  isCommunityWide: false,
  year: String(new Date().getFullYear()),
  description: "",
  startDay: "",
  endDay: "",
  status: "DRAFT",
  budget: "180",
  weight: "90",
};

const STATUS_LABELS: Record<SeasonStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

/**
 * The statuses the form may offer for a season now at `current`. Starting and
 * ending a season are their own flows, so Draft never leads to Active here and
 * Active never to Completed, and nothing returns to Draft. A finished season can
 * be archived and restored.
 */
export function allowedSeasonStatuses(current: SeasonStatus): SeasonStatus[] {
  switch (current) {
    case "DRAFT":
      return ["DRAFT"];
    case "ACTIVE":
      return ["ACTIVE"];
    case "COMPLETED":
      return ["COMPLETED", "ARCHIVED"];
    case "ARCHIVED":
      return ["ARCHIVED", "COMPLETED"];
  }
}

const NO_REQUIRED = "__none__";

/**
 * The programs a season can require: every distinct program on the seasons the
 * super already reads, except the season's own, plus the one already set (so it
 * stays visible even when no listed season carries it). Alphabetical.
 */
export function requiredProgramChoices(
  seasons: { program: string }[],
  ownProgram: string,
  current: string,
): string[] {
  const own = ownProgram.trim();
  const set = new Set(seasons.map((s) => s.program.trim()).filter((p) => p !== ""));
  if (current !== "") set.add(current);
  set.delete(own);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export const dayToDate = (day: string): Date | null => {
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
};

function toBody(
  v: SeasonFormValues,
  canSetRequired: boolean,
  canSetGraduating: boolean,
  canSetCommunity: boolean,
): SeasonIdentityInput {
  return {
    code: v.code,
    program: v.program,
    year: Number(v.year),
    description: v.description.trim() === "" ? null : v.description,
    // Settled before the season starts: left out once it has, so the server has nothing to refuse.
    ...(canSetRequired ? { requiredProgram: v.requiredProgram === "" || v.isCommunityWide ? null : v.requiredProgram } : {}),
    ...(canSetGraduating ? { graduatesOnPass: v.graduatesOnPass && !v.isCommunityWide } : {}),
    ...(canSetCommunity ? { isCommunityWide: v.isCommunityWide } : {}),
    startDate: `${v.startDay}T00:00:00.000Z`,
    endDate: `${v.endDay}T00:00:00.000Z`,
    status: v.status,
    absenceBudgetMinutes: Number(v.budget),
    absenceWeightMinutes: Number(v.weight),
  };
}

/**
 * v1 season-form.tsx for create and edit (B5-4): Program / Year / Code (the
 * code follows program + year until typed over), Description, Start / End /
 * Status, "Attendance rules". Validation is the server's own schema (spec 02
 * §8) so a client error and a 400 cannot disagree.
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
        message ??
        (Object.keys(errors).length > 0 && failedValues === v
          ? "Fix the fields marked above."
          : undefined)
      }
      onSave={submit}
    >
      <View className="flex-col gap-4">
        <FormField
          label="Program"
          required
          description='The recurring program, e.g. "GBV". Groups this season with its other years.'
          error={errors.program}
        >
          <Input
            accessibilityLabel="Program"
            value={v.program}
            onChangeText={(program) => patch({ program })}
            placeholder="GBV"
          />
        </FormField>
        {isSuper ? (
          <CommunityWideField
            value={v.isCommunityWide}
            editable={canSetCommunity}
            onChange={(isCommunityWide) =>
              patch(isCommunityWide ? { isCommunityWide, graduatesOnPass: false, requiredProgram: "" } : { isCommunityWide })
            }
          />
        ) : null}
        {v.isCommunityWide ? null : canSetRequired ? (
          <FormField
            label="Required program"
            description="Someone must have finished this program to join. Leave as None if anyone can."
            error={errors.requiredProgram}
          >
            <Select
              items={{ [NO_REQUIRED]: "None", ...Object.fromEntries(requiredChoices.map((p) => [p, p])) }}
              value={v.requiredProgram === "" ? NO_REQUIRED : v.requiredProgram}
              onValueChange={(p) => patch({ requiredProgram: p === NO_REQUIRED ? "" : p })}
            >
              <SelectTrigger accessibilityLabel="Required program">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_REQUIRED}>None</SelectItem>
                {requiredChoices.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : (
          <View className="flex-col gap-1">
            <Text className="text-sm font-semibold text-foreground">Required program</Text>
            <Text variant="body" className="text-foreground">
              {initial.requiredProgram === "" ? "None" : initial.requiredProgram}
            </Text>
            <Text variant="subhead" className="text-muted-foreground">
              It can only change while the season is a draft.
            </Text>
          </View>
        )}
        {v.isCommunityWide || !isSuper ? null : (
          <GraduatingField
            value={v.graduatesOnPass}
            editable={canSetGraduating}
            onChange={(graduatesOnPass) => patch({ graduatesOnPass })}
          />
        )}
        <FormField label="Year" required error={errors.year}>
          <Input
            accessibilityLabel="Year"
            maxLength={4}
            value={v.year}
            onChangeText={(year) => patch({ year })}
            keyboardType="number-pad"
            placeholder="2026"
          />
        </FormField>
        <FormField
          label="Code"
          required
          description="URL slug — auto-filled from program + year."
          error={errors.code}
        >
          <Input
            accessibilityLabel="Code"
            value={v.code}
            onChangeText={(code) => {
              setCodeTouched(true);
              patch({ code });
            }}
            autoCapitalize="none"
            placeholder="gbv-2026"
          />
        </FormField>

        <FormField label="Description" error={errors.description}>
          <Textarea
            accessibilityLabel="Description"
            value={v.description}
            onChangeText={(description) => patch({ description })}
            placeholder="Optional summary shown on the season overview."
          />
        </FormField>

        <FormField label="Start date" required error={errors.startDate}>
          <DatePicker
            accessibilityLabel="Start date"
            value={dayToDate(v.startDay)}
            onChange={(d) => patch({ startDay: format(d, "yyyy-MM-dd") })}
            ariaInvalid={Boolean(errors.startDate)}
          />
        </FormField>
        <FormField label="End date" required error={errors.endDate}>
          <DatePicker
            accessibilityLabel="End date"
            value={dayToDate(v.endDay)}
            onChange={(d) => patch({ endDay: format(d, "yyyy-MM-dd") })}
            ariaInvalid={Boolean(errors.endDate)}
          />
        </FormField>
        <FormField label="Status" required error={errors.status}>
          <Select
            items={STATUS_LABELS}
            value={v.status}
            onValueChange={(status) => patch({ status: status as SeasonStatus })}
          >
            <SelectTrigger accessibilityLabel="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusChoices.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <View className="flex-col gap-1.5">
          <Text className="text-sm font-semibold text-foreground">Attendance rules</Text>
          <Text className="text-xs text-muted-foreground">
            Late arrivals deduct their actual minutes late from the budget.
          </Text>
          <View className="mt-2 flex-col gap-4">
            <FormField
              label="Total absence budget (minutes)"
              description="Total minutes a student may miss before being flagged."
              error={errors.absenceBudgetMinutes}
            >
              <Input
                accessibilityLabel="Total absence budget (minutes)"
                value={v.budget}
                onChangeText={(budget) => patch({ budget })}
                keyboardType="number-pad"
              />
            </FormField>
            <FormField
              label="Absence weight (minutes)"
              description="How many budget minutes a missed session uses up."
              error={errors.absenceWeightMinutes}
            >
              <Input
                accessibilityLabel="Absence weight (minutes)"
                value={v.weight}
                onChangeText={(weight) => patch({ weight })}
                keyboardType="number-pad"
              />
            </FormField>
          </View>
        </View>

        {children}
      </View>
    </FormScreen>
  );
}
