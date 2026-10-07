import { useState } from "react";
import { View } from "react-native";

import {
  validateStudentForm,
  type StudentFormErrors,
  type StudentFormValues,
} from "../lib/student-form";
import { useTheme } from "../theme";
import { Button, Input, Text } from "../ui";
import { ChoiceChips } from "./ChoiceChips";

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
}

/**
 * One form for create and edit (v1's student-form.tsx), validated with the
 * shared schemas through validateStudentForm — no second hand-written copy.
 * Seeded once from `initial`; callers pass a `key` to reseed.
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
}: StudentFormProps) {
  const theme = useTheme();
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

  return (
    <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
      {serverError ? (
        <Text
          variant="body"
          color={theme.colors.error[600]}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {serverError}
        </Text>
      ) : null}
      <Input label="Full name" value={values.name} onChangeText={(v) => setField("name", v)} error={errors.name} />
      <Input
        label="Email"
        value={values.email}
        onChangeText={(v) => setField("email", v)}
        autoCapitalize="none"
        keyboardType="email-address"
        error={errors.email}
      />
      <Input label="Phone" value={values.phone} onChangeText={(v) => setField("phone", v)} keyboardType="phone-pad" error={errors.phone} />
      <Input label="University" value={values.university} onChangeText={(v) => setField("university", v)} error={errors.university} />
      <Input
        label="Year / faculty"
        value={values.year}
        onChangeText={(v) => setField("year", v)}
        placeholder="e.g. 3rd · Engineering"
        error={errors.year}
      />
      <Input
        label="Date of birth (YYYY-MM-DD)"
        value={values.dateOfBirth}
        onChangeText={(v) => setField("dateOfBirth", v)}
        placeholder="2004-03-09"
        autoCapitalize="none"
        error={errors.dateOfBirth}
      />
      <Input
        label="Spiritual background"
        value={values.spiritualBackground}
        onChangeText={(v) => setField("spiritualBackground", v)}
        multiline
        placeholder="Church affiliation, baptism status, faith journey…"
        error={errors.spiritualBackground}
      />
      <Input
        label="Gifts / interests"
        value={values.gifts}
        onChangeText={(v) => setField("gifts", v)}
        multiline
        placeholder="e.g. worship, hospitality, mentoring younger students"
        error={errors.gifts}
      />
      {showSeason ? (
        <ChoiceChips
          label={seasonLabel}
          options={[
            { value: null, label: "None" },
            ...seasonOptions.map((s) => ({ value: s.id, label: s.title })),
          ]}
          value={values.seasonId}
          onChange={(seasonId) => setField("seasonId", seasonId)}
        />
      ) : null}
      {showNotes ? (
        <>
          <Input
            label="Internal notes"
            value={values.notes}
            onChangeText={(v) => setField("notes", v)}
            multiline
            error={errors.notes}
          />
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Staff only — never shown to the student.
          </Text>
        </>
      ) : null}
      <Button title={submitTitle} onPress={submit} loading={submitting} />
    </View>
  );
}
