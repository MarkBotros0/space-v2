import { format, isValid, parse } from "date-fns";
import { useState, type ReactNode } from "react";
import { View } from "react-native";

import { FormActions, FormErrorBox } from "../design/forms/form-parts";
import { Combobox, DatePicker, Input, Text, Textarea, type ComboboxOption } from "../design/ui";
import { FormField } from "../design/ui/form-field";
import {
  validateStudentForm,
  type StudentFormErrors,
  type StudentFormValues,
} from "../lib/student-form";

export interface StudentFormProps {
  initial: StudentFormValues;
  seasonOptions: readonly { id: number; title: string }[];
  seasonLabel: string;
  showSeason: boolean;
  showNotes: boolean;
  submitTitle: string;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (values: StudentFormValues) => void;
  onCancel?: () => void;
}

/** v1's `<fieldset className="rounded-lg border border-border bg-card p-4 md:p-6">` with its legend. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

const dayToDate = (day: string): Date | null => {
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
};

/**
 * One form for create and edit (v1 student-form.tsx), validated with the
 * shared schemas through validateStudentForm. Seeded once from `initial`;
 * callers pass a `key` to reseed. V2 decisions kept: the create-only
 * enrollment and the staff-only notes caption (students never see notes).
 */
export function StudentForm({
  initial,
  seasonOptions,
  seasonLabel,
  showSeason,
  showNotes,
  submitTitle,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: StudentFormProps) {
  const [values, setValues] = useState<StudentFormValues>(initial);
  const [errors, setErrors] = useState<StudentFormErrors>({});

  function setField<K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const submit = () => {
    const found = validateStudentForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(values);
  };

  const options: ComboboxOption[] = seasonOptions.map((s) => ({
    value: String(s.id),
    label: s.title,
  }));

  return (
    <View className="flex-col gap-6">
      <Section title="Personal">
        <FormField label="Full name" required error={errors.name}>
          <Input
            accessibilityLabel="Full name"
            value={values.name}
            onChangeText={(v) => setField("name", v)}
          />
        </FormField>
        <FormField label="Date of birth" error={errors.dateOfBirth}>
          <DatePicker
            accessibilityLabel="Date of birth"
            value={dayToDate(values.dateOfBirth)}
            onChange={(d) => setField("dateOfBirth", format(d, "yyyy-MM-dd"))}
          />
        </FormField>
      </Section>

      <Section title="Contact">
        <FormField label="Email" required error={errors.email}>
          <Input
            accessibilityLabel="Email"
            value={values.email}
            onChangeText={(v) => setField("email", v)}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </FormField>
        <FormField label="Phone" error={errors.phone}>
          <Input
            accessibilityLabel="Phone"
            value={values.phone}
            onChangeText={(v) => setField("phone", v)}
            keyboardType="phone-pad"
          />
        </FormField>
      </Section>

      <Section title="Academic">
        <FormField label="University" error={errors.university}>
          <Input
            accessibilityLabel="University"
            value={values.university}
            onChangeText={(v) => setField("university", v)}
          />
        </FormField>
        <FormField label="Year / faculty" error={errors.year}>
          <Input
            accessibilityLabel="Year / faculty"
            value={values.year}
            onChangeText={(v) => setField("year", v)}
            placeholder="e.g. 3rd · Engineering"
          />
        </FormField>
      </Section>

      <Section title="Spiritual background">
        <FormField label="Notes" error={errors.spiritualBackground}>
          <Textarea
            accessibilityLabel="Spiritual background"
            value={values.spiritualBackground}
            onChangeText={(v) => setField("spiritualBackground", v)}
            placeholder="Church affiliation, baptism status, faith journey…"
          />
        </FormField>
      </Section>

      <Section title="Community">
        <FormField label="Gifts / interests" error={errors.gifts}>
          <Textarea
            accessibilityLabel="Gifts / interests"
            value={values.gifts}
            onChangeText={(v) => setField("gifts", v)}
            placeholder="e.g. worship, hospitality, mentoring younger students"
          />
        </FormField>
      </Section>

      {showSeason || showNotes ? (
        <Section title="Admin only">
          {showSeason ? (
            <FormField label={seasonLabel}>
              <Combobox
                accessibilityLabel={seasonLabel}
                options={options}
                value={values.seasonId === null ? null : String(values.seasonId)}
                onChange={(v) => setField("seasonId", v === null ? null : Number(v))}
                placeholder="None"
                clearable
              />
            </FormField>
          ) : null}
          {showNotes ? (
            <FormField
              label="Internal notes"
              description="Staff only. The student never sees these."
              error={errors.notes}
            >
              <Textarea
                accessibilityLabel="Internal notes"
                value={values.notes}
                onChangeText={(v) => setField("notes", v)}
              />
            </FormField>
          ) : null}
        </Section>
      ) : null}

      <FormErrorBox message={serverError} />
      <FormActions
        submitLabel={submitTitle}
        pending={submitting}
        onSubmit={submit}
        onCancel={onCancel}
      />
    </View>
  );
}
