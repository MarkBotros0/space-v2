/**
 * The season form's parts, one per question it asks: what the season is, when
 * it runs, who takes part, what it is about, and its attendance rules.
 */
import { format } from "date-fns";
import { useState } from "react";
import { View } from "react-native";

import { FieldCell, FieldRow, FormSection } from "../../design/forms/form-section";
import {
  DatePicker,
  Input,
  PillButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Text,
} from "../../design/ui";
import { FormField } from "../../design/ui/form-field";
import { dayToDate, NO_REQUIRED, type SeasonFormValues } from "./season-form-model";

type Errors = Record<string, string>;
type Patch = (next: Partial<SeasonFormValues>) => void;

export function IdentitySection({
  v,
  errors,
  patch,
  onCode,
}: {
  v: SeasonFormValues;
  errors: Errors;
  patch: Patch;
  onCode: (code: string) => void;
}) {
  // The code follows program + year; changing it by hand is rare, so it hides behind Change.
  const [editingCode, setEditingCode] = useState(false);
  const showCode = editingCode || Boolean(errors.code);
  return (
    <FormSection title="Program and year">
      <FieldRow>
        <FieldCell grow={2}>
          <FormField
            label="Program"
            required
            description='e.g. "GBV". Links its seasons across years.'
            error={errors.program}
          >
            <Input
              accessibilityLabel="Program"
              value={v.program}
              onChangeText={(program) => patch({ program })}
              placeholder="GBV"
            />
          </FormField>
        </FieldCell>
        <FieldCell>
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
        </FieldCell>
      </FieldRow>
      {showCode ? (
        <FormField
          label="Code"
          required
          description="Used in the season's link."
          error={errors.code}
        >
          <Input
            accessibilityLabel="Code"
            value={v.code}
            onChangeText={onCode}
            autoCapitalize="none"
            placeholder="gbv-2026"
          />
        </FormField>
      ) : (
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text variant="caption" className="text-muted-foreground">
              Code
            </Text>
            <Text variant="body" numberOfLines={1}>
              {v.code === "" ? "Filled in from program and year" : v.code}
            </Text>
          </View>
          <PillButton
            label="Change"
            accessibilityLabel="Change code"
            onPress={() => setEditingCode(true)}
          />
        </View>
      )}
    </FormSection>
  );
}

export function DatesSection({
  v,
  errors,
  patch,
}: {
  v: SeasonFormValues;
  errors: Errors;
  patch: Patch;
}) {
  return (
    <FormSection title="Dates">
      <FieldRow>
        <FieldCell>
          <FormField label="Start date" required error={errors.startDate}>
            <DatePicker
              accessibilityLabel="Start date"
              value={dayToDate(v.startDay)}
              onChange={(d) => patch({ startDay: format(d, "yyyy-MM-dd") })}
              ariaInvalid={Boolean(errors.startDate)}
            />
          </FormField>
        </FieldCell>
        <FieldCell>
          <FormField label="End date" required error={errors.endDate}>
            <DatePicker
              accessibilityLabel="End date"
              value={dayToDate(v.endDay)}
              onChange={(d) => patch({ endDay: format(d, "yyyy-MM-dd") })}
              ariaInvalid={Boolean(errors.endDate)}
            />
          </FormField>
        </FieldCell>
      </FieldRow>
    </FormSection>
  );
}

/** Required program and Graduating season: who may join, and what passing it means. */
export function TakingPartSection({
  v,
  errors,
  patch,
  canSetRequired,
  requiredChoices,
  savedRequired,
  graduating,
}: {
  v: SeasonFormValues;
  errors: Errors;
  patch: Patch;
  canSetRequired: boolean;
  requiredChoices: string[];
  savedRequired: string;
  /** "edit": the switch; "locked": shown, the season has finished; "hidden": not a super. */
  graduating: "edit" | "locked" | "hidden";
}) {
  return (
    <FormSection title="Who takes part">
      {canSetRequired ? (
        <FormField
          label="Required program"
          description="Someone must have finished this program to join. None means anyone can."
          error={errors.requiredProgram}
        >
          <Select
            items={{
              [NO_REQUIRED]: "None",
              ...Object.fromEntries(requiredChoices.map((p) => [p, p])),
            }}
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
        <View className="flex-col gap-0.5">
          <Text variant="caption" className="text-muted-foreground">
            Required program
          </Text>
          <Text variant="body">{savedRequired === "" ? "None" : savedRequired}</Text>
          <Text variant="caption" className="text-muted-foreground">
            It can only change while the season is a draft.
          </Text>
        </View>
      )}
      {graduating === "edit" ? (
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="headline" onPress={() => patch({ graduatesOnPass: !v.graduatesOnPass })}>
              Graduating season
            </Text>
            <Text variant="caption" className="text-muted-foreground">
              Everyone who passes becomes an alumnus when it ends, School of its year.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Graduating season"
            checked={v.graduatesOnPass}
            onCheckedChange={(graduatesOnPass) => patch({ graduatesOnPass })}
          />
        </View>
      ) : graduating === "locked" ? (
        <View className="flex-col gap-0.5">
          <Text variant="caption" className="text-muted-foreground">
            Graduating season
          </Text>
          <Text variant="body">{`${v.graduatesOnPass ? "Yes" : "No"}. It can't change now the season has finished.`}</Text>
        </View>
      ) : null}
    </FormSection>
  );
}

export function AttendanceSection({
  v,
  errors,
  patch,
}: {
  v: SeasonFormValues;
  errors: Errors;
  patch: Patch;
}) {
  return (
    <FormSection
      title="Attendance rules"
      note="Late arrivals use up their actual minutes late from the budget."
    >
      <FieldRow>
        <FieldCell>
          <FormField
            label="Absence budget"
            description="Minutes a student may miss before being flagged."
            error={errors.absenceBudgetMinutes}
          >
            <Input
              accessibilityLabel="Total absence budget (minutes)"
              value={v.budget}
              onChangeText={(budget) => patch({ budget })}
              keyboardType="number-pad"
            />
          </FormField>
        </FieldCell>
        <FieldCell>
          <FormField
            label="Missed session"
            description="Budget minutes one missed session uses."
            error={errors.absenceWeightMinutes}
          >
            <Input
              accessibilityLabel="Absence weight (minutes)"
              value={v.weight}
              onChangeText={(weight) => patch({ weight })}
              keyboardType="number-pad"
            />
          </FormField>
        </FieldCell>
      </FieldRow>
    </FormSection>
  );
}
