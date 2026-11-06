import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  OWN_PROFILE_FIELDS,
  updateOwnProfileInputSchema,
  yearFromText,
  type MyProfile,
  type OwnProfileField,
} from "@space/shared";

import { Fieldset } from "../../design/forms/fieldset";
import { FormField, Input as InputV1, Text as TextV1, toast } from "../../design/ui";
import { useUpdateStudentProfile } from "../../hooks/use-self-service";
import { apiErrorMessage } from "../../lib/api-error";

type FormValues = Record<OwnProfileField, string>;

function toFormValues(p: MyProfile): FormValues {
  return {
    university: p.university ?? "",
    faculty: p.faculty ?? "",
    universityGraduationYear:
      p.universityGraduationYear === null ? "" : String(p.universityGraduationYear),
    phone: p.phone ?? "",
    dateOfBirth: p.dateOfBirth ?? "",
  };
}

/** What this form edits. Phone and date of birth are in Settings → Profile
 *  details (owner, 2026-11-06), with name and address — one editor per field. */
const ACADEMIC_FIELDS = [
  "university",
  "faculty",
  "universityGraduationYear",
] as const satisfies readonly OwnProfileField[];

function isOwnProfileField(key: string): key is OwnProfileField {
  return OWN_PROFILE_FIELDS.some((field) => field === key);
}

/**
 * v1 student-form.tsx in its isSelf mode — the student's own academic fields
 * (Decision 1): university, faculty and university graduation year.
 * The fields and the save action are returned apart, so the screen can pin
 * Save in `FormScreen`'s footer instead of leaving it below the long form.
 */
export function useProfileForm(profile: MyProfile): {
  fields: ReactNode;
  save: () => void;
  saving: boolean;
  /** True while the fields differ from what is saved; Save is enabled only then. */
  dirty: boolean;
} {
  const update = useUpdateStudentProfile();
  const [values, setValues] = useState<FormValues>(() => toFormValues(profile));
  // What the server holds: the opening values, then whatever the last save landed.
  const [saved, setSaved] = useState<FormValues>(() => toFormValues(profile));
  const dirty = ACADEMIC_FIELDS.some((field) => values[field] !== saved[field]);
  const [errors, setErrors] = useState<Partial<Record<OwnProfileField, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const set = (field: OwnProfileField) => (text: string) =>
    setValues((v) => ({ ...v, [field]: text }));

  const save = () => {
    setSubmitError(null);
    // The year travels as a number; the text is "" or digits once valid.
    const body = {
      university: values.university,
      faculty: values.faculty,
      universityGraduationYear: yearFromText(values.universityGraduationYear),
    };
    // The SAME schema the server runs — v1's client and server copies had
    // drifted (spec 06 R21); here they cannot.
    const parsed = updateOwnProfileInputSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<OwnProfileField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && isOwnProfileField(key) && next[key] === undefined) {
          next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    const sent = values;
    update.mutate(parsed.data, {
      onSuccess: () => {
        setSaved(sent);
        toast.success("Profile saved.");
      },
      onError: (err) => setSubmitError(apiErrorMessage(err, "Couldn't save your profile.")),
    });
  };

  const fields = (
    <View className="flex-col gap-6">
      <Fieldset legend="Academic">
        <FormField label="University" error={errors.university}>
          <InputV1
            accessibilityLabel="University"
            value={values.university}
            onChangeText={set("university")}
          />
        </FormField>
        <FormField label="Faculty" error={errors.faculty}>
          <InputV1
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
          <InputV1
            accessibilityLabel="Graduation year"
            keyboardType="number-pad"
            maxLength={4}
            placeholder="e.g. 2027"
            value={values.universityGraduationYear}
            onChangeText={set("universityGraduationYear")}
          />
        </FormField>
      </Fieldset>
      {submitError ? (
        <TextV1
          accessibilityLiveRegion="polite"
          className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad"
        >
          {submitError}
        </TextV1>
      ) : null}
    </View>
  );
  return { fields, save, saving: update.isPending, dirty };
}
