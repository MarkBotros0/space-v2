import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  updateOwnProfileInputSchema,
  yearFromText,
  type MyProfile,
  type UpdateOwnProfileInput,
} from "@space/shared";

import { FormField, Input } from "../../design/ui";
import { useUpdateStudentProfile } from "../../hooks/use-self-service";

/**
 * What a student edits on their own record (Decision 1): university, faculty and
 * university graduation year (`StudentProfile.universityGraduationYear`, which may
 * be in the future — not `User.graduationYear`). Phone and date of birth are in
 * the personal details, one editor per field. Like `usePersonalForm`, the screen
 * owns the Save: `validate` then `commit`.
 */
const FIELDS = ["university", "faculty", "universityGraduationYear"] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

function valuesOf(p: MyProfile): Values {
  return {
    university: p.university ?? "",
    faculty: p.faculty ?? "",
    universityGraduationYear:
      p.universityGraduationYear === null ? "" : String(p.universityGraduationYear),
  };
}

export function useAcademicForm(profile: MyProfile): {
  fields: ReactNode;
  dirty: boolean;
  validate: () => UpdateOwnProfileInput | null;
  commit: (body: UpdateOwnProfileInput) => Promise<void>;
  saving: boolean;
} {
  const update = useUpdateStudentProfile();
  const [values, setValues] = useState<Values>(() => valuesOf(profile));
  // What the server holds: the opening values, then whatever the last save landed.
  const [saved, setSaved] = useState<Values>(() => valuesOf(profile));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = (field: Field) => (text: string) => setValues((v) => ({ ...v, [field]: text }));

  const validate = () => {
    // The year travels as a number; the text is "" or digits once valid.
    const body = {
      university: values.university,
      faculty: values.faculty,
      universityGraduationYear: yearFromText(values.universityGraduationYear),
    };
    // The SAME schema the server runs (spec 06 R21).
    const parsed = updateOwnProfileInputSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && (FIELDS as readonly string[]).includes(key))
          next[key as Field] ??= issue.message;
      }
      setErrors(next);
      return null;
    }
    setErrors({});
    return parsed.data;
  };

  const commit = async (body: UpdateOwnProfileInput) => {
    const sent = values;
    await update.mutateAsync(body);
    setSaved(sent);
  };

  const fields = (
    <View className="flex-col gap-4">
      <FormField label="University" error={errors.university}>
        <Input
          accessibilityLabel="University"
          value={values.university}
          onChangeText={set("university")}
        />
      </FormField>
      <FormField label="Faculty" error={errors.faculty}>
        <Input
          accessibilityLabel="Faculty"
          placeholder="e.g. Engineering"
          value={values.faculty}
          onChangeText={set("faculty")}
        />
      </FormField>
      <FormField
        label="Graduation year"
        description="Your university graduation year — it can be in the future."
        error={errors.universityGraduationYear}
      >
        <Input
          accessibilityLabel="Graduation year"
          keyboardType="number-pad"
          maxLength={4}
          placeholder="e.g. 2027"
          value={values.universityGraduationYear}
          onChangeText={set("universityGraduationYear")}
        />
      </FormField>
    </View>
  );

  const dirty = FIELDS.some((field) => values[field] !== saved[field]);
  return { fields, dirty, validate, commit, saving: update.isPending };
}
