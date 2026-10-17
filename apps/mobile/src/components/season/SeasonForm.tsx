import { format, isValid, parse } from "date-fns";
import { useState } from "react";
import { View } from "react-native";
import { seasonWriteRequestSchema, type SeasonStatus } from "@space/shared";

import { FormActions, FormErrorBox } from "../../design/forms/form-parts";
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
import { FormField } from "../../design/ui/form-field";
import { firstErrorByField } from "../../lib/form-errors";
import { autoSeasonCode } from "../../lib/season-defaults";
import type { SeasonIdentityInput } from "../../hooks/use-season-writes";

export interface SeasonFormValues {
  code: string;
  program: string;
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

export const dayToDate = (day: string): Date | null => {
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
};

function toBody(v: SeasonFormValues): SeasonIdentityInput {
  return {
    code: v.code,
    program: v.program,
    year: Number(v.year),
    description: v.description.trim() === "" ? null : v.description,
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
  initial,
  submitting,
  message,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initial: SeasonFormValues;
  submitting: boolean;
  message: string | null;
  onSubmit: (body: SeasonIdentityInput) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // v1: an edit never auto-fills the code.
  const [codeTouched, setCodeTouched] = useState(mode === "edit" || initial.code !== "");

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
    const body = toBody(v);
    const parsed = seasonWriteRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    onSubmit(body);
  };

  return (
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
      <FormField label="Year" required error={errors.year}>
        <Input
          accessibilityLabel="Year"
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
            {(Object.keys(STATUS_LABELS) as SeasonStatus[]).map((s) => (
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
            label="Total Absence budget (minutes)"
            description="Total minutes a student may miss before being flagged."
            error={errors.absenceBudgetMinutes}
          >
            <Input
              accessibilityLabel="Total Absence budget (minutes)"
              value={v.budget}
              onChangeText={(budget) => patch({ budget })}
              keyboardType="number-pad"
            />
          </FormField>
          <FormField
            label="Absence weight (minutes)"
            description="How many budget minutes one ABSENT consumes."
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

      <FormErrorBox message={message} />
      <FormActions
        submitLabel={mode === "create" ? "Create season" : "Save changes"}
        pending={submitting}
        onSubmit={submit}
        onCancel={onCancel}
      />
    </View>
  );
}
